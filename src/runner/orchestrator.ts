import * as mupdf from 'mupdf';
import { createModel } from '../ai/providers';
import { analyzePages } from '../ai/analyze';
import type { AnalyzePage } from '../ai/analyze';
import { generateBatches } from '../pdf/batches';
import {
  HIGHLIGHT_EXACT,
  HIGHLIGHT_PARTIAL,
  addHighlight,
  buildAnnotationComment,
  findAnchor,
  openPdf,
  readExistingAnnotations,
} from '../pdf/mupdf';
import type { ProofError, Rect } from '../pdf/mupdf';
import { extractPageContent, formatBlocksForLLM } from '../pdf/textmap';
import type { PageContent } from '../pdf/textmap';
import { buildPrompt } from './prompt';
import type { Settings } from '../store/settings';

export type BatchStatus = 'queued' | 'running' | 'done' | 'error';

export interface BatchProgress {
  index: number;
  pageNums: number[];
  status: BatchStatus;
  errorsFound?: number;
  errorMessage?: string;
}

/**
 * One reviewer card. `id` is stable across edits/re-anchors. `annot` is the
 * mupdf annotation reference, kept so we can update or remove the highlight in
 * place when the user edits or deletes the row. Unmatched rows have no annot.
 */
export interface ProofErrorRow {
  id: string;
  page: number;
  text: string;
  error: string;
  fix: string;
  match: 'exact' | 'partial' | 'unmatched';
  rects: Rect[];
  pageWidth: number;
  pageHeight: number;
  annot: mupdf.PDFAnnotation | null;
}

export interface RunHandle {
  doc: mupdf.PDFDocument;
  originalPdf: Blob;
  /** Resolves with batch summary when the run finishes (or aborts cleanly). */
  done: Promise<{ batchesRun: number; pagesScanned: number }>;
}

export interface RunOptions {
  file: File;
  settings: Settings;
  onProgress: (p: BatchProgress) => void;
  /** Called once per flushed batch with that batch's de-duplicated rows. */
  onErrors: (rows: ProofErrorRow[], batchIndex: number) => void;
  abortSignal: AbortSignal;
}

/**
 * Kick off the proofreading run. Returns synchronously-ish: we open the PDF
 * first (so the caller can mount the viewer immediately) and return a handle
 * containing the live `doc` and a `done` promise. Errors stream out per batch
 * via `onErrors`, in **strict batch order**: out-of-order completions are
 * buffered until the next-expected batch arrives.
 */
export async function startProofread(opts: RunOptions): Promise<RunHandle> {
  const { file, settings, onProgress, onErrors, abortSignal } = opts;
  const fileBytes = await file.arrayBuffer();
  const originalPdf = new Blob([fileBytes], { type: 'application/pdf' });
  const { doc, pageCount } = await openPdf(fileBytes);

  const startIdx = Math.max(0, (settings.startPage ?? 1) - 1);
  const endIdx = Math.min(pageCount, settings.endPage ?? pageCount);

  const batches = generateBatches(startIdx, endIdx, settings.pagesPerBatch, settings.overlap);

  batches.forEach((pageNums, index) =>
    onProgress({ index, pageNums, status: 'queued' }),
  );

  const done = (async () => {
    const model = createModel(settings);
    const limit = settings.concurrency > 0 ? settings.concurrency : batches.length;
    const sem = new Semaphore(limit);

    const pageContents = new Map<number, PageContent>();
    const seen = new Set<string>();

    // Strict in-order flush bookkeeping. `buffered[i]` is set once batch i
    // completes (or errors). `nextToFlush` advances past every batch that has
    // landed.
    const buffered = new Map<number, ProofErrorRow[] | null>();
    let nextToFlush = 0;
    const flushReady = () => {
      while (buffered.has(nextToFlush)) {
        const rows = buffered.get(nextToFlush)!;
        buffered.delete(nextToFlush);
        if (rows && rows.length) onErrors(rows, nextToFlush);
        nextToFlush++;
      }
    };

    let nextRowId = 0;

    await Promise.all(
      batches.map((pageNums, index) =>
        sem.run(async () => {
          if (abortSignal.aborted) {
            buffered.set(index, null);
            flushReady();
            return;
          }
          onProgress({ index, pageNums, status: 'running' });
          try {
            const existing = readExistingAnnotations(doc, pageNums);
            const pages: AnalyzePage[] = pageNums.map((pageIdx, i) => {
              let pc = pageContents.get(pageIdx);
              if (!pc) {
                pc = extractPageContent(doc, pageIdx);
                pageContents.set(pageIdx, pc);
              }
              return {
                localPageNum: i + 1,
                imagePng: pc.imagePng,
                text: formatBlocksForLLM(pc.blocks),
              };
            });
            const prompt = buildPrompt(settings.prompt, pageNums, existing);
            const errs = await analyzePages({
              model,
              modelName: settings.model,
              pages,
              pageNums,
              prompt,
              abortSignal,
            });

            const rows: ProofErrorRow[] = [];
            for (const e of errs) {
              const key = `${e.page}|${e.text}|${e.error}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const pc = pageContents.get(e.page - 1);
              const anchor = findAnchor(doc, e, pc);
              const id = `r${nextRowId++}`;
              if (anchor) {
                const isExact = anchor.match === 'exact';
                const comment = buildAnnotationComment(
                  e.error,
                  e.fix,
                  isExact ? undefined : e.text,
                );
                const annot = addHighlight(doc, {
                  page: e.page,
                  quads: anchor.quads,
                  contents: comment,
                  color: isExact ? HIGHLIGHT_EXACT : HIGHLIGHT_PARTIAL,
                });
                rows.push({
                  id,
                  page: e.page,
                  text: e.text,
                  error: e.error,
                  fix: e.fix,
                  match: anchor.match,
                  rects: anchor.rects,
                  pageWidth: anchor.pageWidth,
                  pageHeight: anchor.pageHeight,
                  annot,
                });
              } else {
                const page = doc.loadPage(e.page - 1);
                const [, , w, h] = page.getBounds();
                rows.push({
                  id,
                  page: e.page,
                  text: e.text,
                  error: e.error,
                  fix: e.fix,
                  match: 'unmatched',
                  rects: [],
                  pageWidth: w,
                  pageHeight: h,
                  annot: null,
                });
              }
            }
            buffered.set(index, rows);
            flushReady();
            onProgress({ index, pageNums, status: 'done', errorsFound: rows.length });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            buffered.set(index, null);
            flushReady();
            onProgress({ index, pageNums, status: 'error', errorMessage: message });
          }
        }),
      ),
    );

    return { batchesRun: batches.length, pagesScanned: endIdx - startIdx };
  })();

  return { doc, originalPdf, done };
}

/** Map a `ProofErrorRow` back to the storage shape used for JSON export. */
export function rowToProofError(row: ProofErrorRow): ProofError {
  return {
    page: row.page,
    text: row.text,
    error: row.error,
    fix: row.fix,
    match: row.match,
  };
}

class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.waiters.shift();
      if (next) next();
    }
  }
}
