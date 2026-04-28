import { createModel } from '../ai/providers';
import { analyzePages } from '../ai/analyze';
import { generateBatches } from '../pdf/batches';
import {
  annotateError,
  extractBatchPdf,
  openPdf,
  readExistingAnnotations,
  saveAnnotated,
} from '../pdf/mupdf';
import type { ProofError } from '../pdf/mupdf';
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

export interface RunResult {
  annotatedPdf: Blob;
  originalPdf: Blob;
  errors: ProofError[];
  batchesRun: number;
  pagesScanned: number;
}

export interface RunOptions {
  file: File;
  settings: Settings;
  onProgress: (p: BatchProgress) => void;
  abortSignal: AbortSignal;
}

export async function runProofread(opts: RunOptions): Promise<RunResult> {
  const { file, settings, onProgress, abortSignal } = opts;
  const fileBytes = await file.arrayBuffer();
  const { doc, pageCount } = await openPdf(fileBytes);

  const startIdx = Math.max(0, (settings.startPage ?? 1) - 1);
  const endIdx = Math.min(pageCount, settings.endPage ?? pageCount);

  const batches = generateBatches(startIdx, endIdx, settings.pagesPerBatch, settings.overlap);

  // Initial progress events so the UI can render the queue.
  batches.forEach((pageNums, index) =>
    onProgress({ index, pageNums, status: 'queued' }),
  );

  const model = createModel(settings);
  const limit = settings.concurrency > 0 ? settings.concurrency : batches.length;
  const sem = new Semaphore(limit);

  const allRaw: { batch: number; errs: Omit<ProofError, 'match'>[] }[] = [];

  await Promise.all(
    batches.map((pageNums, index) =>
      sem.run(async () => {
        if (abortSignal.aborted) return;
        onProgress({ index, pageNums, status: 'running' });
        try {
          const existing = readExistingAnnotations(doc, pageNums);
          const pdfBytes = extractBatchPdf(doc, pageNums);
          const prompt = buildPrompt(settings.prompt, pageNums, existing);
          const errs = await analyzePages({
            model,
            modelName: settings.model,
            pdfBytes,
            pageNums,
            prompt,
            abortSignal,
          });
          allRaw.push({ batch: index, errs });
          onProgress({ index, pageNums, status: 'done', errorsFound: errs.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          onProgress({ index, pageNums, status: 'error', errorMessage: message });
        }
      }),
    ),
  );

  // Deduplicate by (page, text, error)
  const seen = new Set<string>();
  const finalErrors: ProofError[] = [];
  for (const { errs } of allRaw) {
    for (const e of errs) {
      const key = `${e.page}|${e.text}|${e.error}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const match = annotateError(doc, { ...e, match: 'unmatched' });
      finalErrors.push({ ...e, match });
    }
  }

  const annotatedBytes = saveAnnotated(doc);
  return {
    annotatedPdf: new Blob([annotatedBytes as BlobPart], { type: 'application/pdf' }),
    originalPdf: new Blob([fileBytes], { type: 'application/pdf' }),
    errors: finalErrors,
    batchesRun: batches.length,
    pagesScanned: endIdx - startIdx,
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
