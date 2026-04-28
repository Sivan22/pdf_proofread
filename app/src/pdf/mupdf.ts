import * as mupdf from 'mupdf';

export interface ProofError {
  page: number;
  text: string;
  error: string;
  fix: string;
  match: 'exact' | 'partial' | 'unmatched';
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
 * Build a brand-new sub-PDF that contains only the requested pages of `doc`,
 * grafted over in the order given. Pages are 0-indexed.
 */
export function extractBatchPdf(
  doc: mupdf.PDFDocument,
  pageNums: number[],
): Uint8Array {
  const sub = new mupdf.PDFDocument();
  for (const pageNum of pageNums) {
    sub.graftPage(-1, doc, pageNum);
  }
  const buffer = sub.saveToBuffer('');
  return buffer.asUint8Array();
}

/**
 * Annotate a single proofreading error onto the document.
 *
 * Strategy:
 *   1. Try to find the exact `err.text` on `err.page` (1-indexed). If found,
 *      add a yellow highlight with `טעות / תיקון` in the contents → 'exact'.
 *   2. Otherwise, scan words longer than 2 chars and add an orange highlight
 *      around the first hit with `[חיפוש: ...]` prefixed → 'partial'.
 *   3. Otherwise, return 'unmatched' without touching the doc.
 */
export function annotateError(
  doc: mupdf.PDFDocument,
  err: ProofError,
): 'exact' | 'partial' | 'unmatched' {
  const pageIdx = err.page - 1;
  if (pageIdx < 0 || pageIdx >= doc.countPages()) return 'unmatched';
  const page = doc.loadPage(pageIdx);
  const comment = `טעות: ${err.error}\nתיקון: ${err.fix}`;

  const exact = page.search(err.text);
  if (exact && exact.length > 0) {
    addHighlight(page, flatten(exact), comment, [1, 1, 0]);
    return 'exact';
  }

  for (const word of err.text.split(/\s+/)) {
    if (word.length <= 2) continue;
    const hit = page.search(word);
    if (hit && hit.length > 0) {
      addHighlight(page, flatten(hit), `[חיפוש: ${err.text}]\n${comment}`, [1, 0.7, 0]);
      return 'partial';
    }
  }
  return 'unmatched';
}

function flatten(quads: mupdf.Quad[][]): mupdf.Quad[] {
  return quads.flat();
}

function addHighlight(
  page: mupdf.PDFPage,
  quads: mupdf.Quad[],
  contents: string,
  rgb: [number, number, number],
): void {
  const annot = page.createAnnotation('Highlight');
  annot.setQuadPoints(quads);
  annot.setContents(contents);
  annot.setColor(rgb);
  annot.setAuthor('סקירת עריכה');
  annot.update();
}

/**
 * Serialize the (mutated) document as a PDF byte array using an incremental
 * save so previously existing structure is preserved.
 */
export function saveAnnotated(doc: mupdf.PDFDocument): Uint8Array {
  const buffer = doc.saveToBuffer('incremental');
  return buffer.asUint8Array();
}
