import * as mupdf from 'mupdf';
import { findText } from './textmap';
import type { PageContent } from './textmap';

export interface ProofError {
  page: number;
  text: string;
  error: string;
  fix: string;
  match: 'exact' | 'partial' | 'unmatched';
}

/** Page-relative axis-aligned rectangle in PDF points (mupdf top-left origin). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface AnchorMatch {
  match: 'exact' | 'partial';
  quads: mupdf.Quad[];
  rects: Rect[];
  pageWidth: number;
  pageHeight: number;
}

export interface OpenedPdf {
  doc: mupdf.PDFDocument;
  pageCount: number;
}

/**
 * Open a PDF from raw bytes. Throws if the document is not a PDF.
 */
export async function openPdf(bytes: ArrayBuffer): Promise<OpenedPdf> {
  const buffer = new Uint8Array(bytes);
  const generic = mupdf.Document.openDocument(buffer, 'application/pdf');
  const doc = generic.asPDF();
  if (!doc) {
    throw new Error('openPdf: input is not a PDF document');
  }
  return { doc, pageCount: doc.countPages() };
}

/**
 * Read existing annotation contents (the `/Contents` field) from the given pages.
 * Pages are 0-indexed. Pages with no annotations are omitted from the result.
 */
export function readExistingAnnotations(
  doc: mupdf.PDFDocument,
  pageNums: number[],
): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const pageNum of pageNums) {
    const page = doc.loadPage(pageNum);
    const annots = page.getAnnotations();
    const contents: string[] = [];
    for (const annot of annots) {
      const c = annot.getContents();
      if (c) contents.push(c);
    }
    if (contents.length) out[pageNum] = contents;
  }
  return out;
}

/**
 * Locate the on-page region for an error quote.
 *
 * Order of attempts:
 *   1. textmap-based `findText` (exact, then letter-only).
 *   2. mupdf `page.search` for the whole quote (exact precision).
 *   3. word-by-word `page.search` fallback (partial precision).
 *
 * Returns null when nothing matches.
 */
export function findAnchor(
  doc: mupdf.PDFDocument,
  err: Pick<ProofError, 'page' | 'text'>,
  pageContent?: PageContent,
): AnchorMatch | null {
  const pageIdx = err.page - 1;
  if (pageIdx < 0 || pageIdx >= doc.countPages()) return null;
  const page = doc.loadPage(pageIdx);
  const [, , w, h] = page.getBounds();

  if (pageContent) {
    const tm = findText(pageContent.blocks, err.text);
    if (tm && tm.quads.length > 0) {
      return {
        match: tm.precision,
        quads: tm.quads,
        rects: coalesceRectsByLine(tm.quads.map(quadToRect)),
        pageWidth: w,
        pageHeight: h,
      };
    }
  }

  const exact = page.search(err.text);
  if (exact && exact.length > 0) {
    const quads = exact.flat();
    return {
      match: 'exact',
      quads,
      rects: coalesceRectsByLine(quads.map(quadToRect)),
      pageWidth: w,
      pageHeight: h,
    };
  }

  for (const word of err.text.split(/\s+/)) {
    if (word.length <= 2) continue;
    const hit = page.search(word);
    if (hit && hit.length > 0) {
      const quads = hit.flat();
      return {
        match: 'partial',
        quads,
        rects: coalesceRectsByLine(quads.map(quadToRect)),
        pageWidth: w,
        pageHeight: h,
      };
    }
  }
  return null;
}

/** Build the mupdf Quad list for a list of axis-aligned rectangles in PDF points. */
export function rectsToQuads(rects: Rect[]): mupdf.Quad[] {
  return rects.map(
    (r) => [r.x0, r.y0, r.x1, r.y0, r.x0, r.y1, r.x1, r.y1] as unknown as mupdf.Quad,
  );
}

export interface AnnotationParams {
  page: number;
  quads: mupdf.Quad[];
  contents: string;
  color: [number, number, number];
}

/**
 * Add a highlight annotation to the document. Returns the annot so it can be
 * removed or updated later.
 */
export function addHighlight(
  doc: mupdf.PDFDocument,
  params: AnnotationParams,
): mupdf.PDFAnnotation {
  const page = doc.loadPage(params.page - 1);
  const annot = page.createAnnotation('Highlight');
  annot.setQuadPoints(params.quads);
  annot.setContents(params.contents);
  annot.setColor(params.color);
  annot.setAuthor('סקירת עריכה');
  annot.update();
  return annot;
}

/**
 * Remove an existing annotation by its 1-indexed page number and the annot
 * reference returned from `addHighlight`.
 */
export function removeAnnotation(
  doc: mupdf.PDFDocument,
  pageNum: number,
  annot: mupdf.PDFAnnotation,
): void {
  const page = doc.loadPage(pageNum - 1);
  try {
    page.deleteAnnotation(annot);
  } catch {
    // annot already removed — ignore
  }
}

/** Update only the contents of an annotation (the popup text). */
export function updateAnnotationContents(
  annot: mupdf.PDFAnnotation,
  contents: string,
): void {
  annot.setContents(contents);
  annot.update();
}

/**
 * Merge per-character rectangles into one rectangle per visual line. Two rects
 * are treated as belonging to the same line when their vertical ranges overlap
 * by more than half of the shorter height. The output preserves source order
 * (top-to-bottom).
 */
export function coalesceRectsByLine(rects: Rect[]): Rect[] {
  if (rects.length === 0) return [];
  const sorted = [...rects].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: Rect[] = [];
  for (const r of sorted) {
    const last = lines[lines.length - 1];
    if (last) {
      const overlap = Math.min(r.y1, last.y1) - Math.max(r.y0, last.y0);
      const minH = Math.min(r.y1 - r.y0, last.y1 - last.y0);
      if (overlap > minH * 0.5) {
        last.x0 = Math.min(last.x0, r.x0);
        last.x1 = Math.max(last.x1, r.x1);
        last.y0 = Math.min(last.y0, r.y0);
        last.y1 = Math.max(last.y1, r.y1);
        continue;
      }
    }
    lines.push({ ...r });
  }
  return lines;
}

/** Convert a mupdf quad to its bounding rectangle in PDF points. */
export function quadToRect(q: mupdf.Quad): Rect {
  // mupdf.Quad is `[ul_x, ul_y, ur_x, ur_y, ll_x, ll_y, lr_x, lr_y]`.
  const a = q as unknown as number[];
  const xs = [a[0], a[2], a[4], a[6]];
  const ys = [a[1], a[3], a[5], a[7]];
  return {
    x0: Math.min(...xs),
    y0: Math.min(...ys),
    x1: Math.max(...xs),
    y1: Math.max(...ys),
  };
}

/** Build the annotation comment string from an error. */
export function buildAnnotationComment(
  errorText: string,
  fixText: string,
  searchedQuote?: string,
): string {
  const head = searchedQuote ? `[חיפוש: ${searchedQuote}]\n` : '';
  return `${head}טעות: ${errorText}\nתיקון: ${fixText}`;
}

export const HIGHLIGHT_EXACT: [number, number, number] = [1, 1, 0];
export const HIGHLIGHT_PARTIAL: [number, number, number] = [1, 0.7, 0];

/**
 * Serialize the (mutated) document as a PDF byte array using an incremental
 * save so previously existing structure is preserved.
 */
export function saveAnnotated(doc: mupdf.PDFDocument): Uint8Array {
  const buffer = doc.saveToBuffer('incremental');
  return buffer.asUint8Array();
}
