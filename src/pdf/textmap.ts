import * as mupdf from 'mupdf';

/**
 * One text region of a page (column/paragraph/title/footnote). Distinct blocks
 * are kept separate so that text searches never match across unrelated areas.
 *
 * `text` is a visual-line-grouped string: stext-lines that share a Y baseline
 * (which mupdf often splits when a single visual line was typeset as several
 * runs) are concatenated with no separator, while real line breaks within the
 * block are emitted as `\n`. `quads[i]` is the on-page quad for `text[i]`, or
 * `null` when `text[i]` is the inserted `\n`.
 */
export interface TextBlock {
  index: number;
  bbox: { x: number; y: number; w: number; h: number };
  text: string;
  quads: (mupdf.Quad | null)[];
}

export interface PageContent {
  pageIdx: number;
  pageNum: number;
  blocks: TextBlock[];
  imagePng: Uint8Array;
  width: number;
  height: number;
}

export interface TextMatch {
  blockIdx: number;
  startChar: number;
  endChar: number;
  quads: mupdf.Quad[];
  /**
   * `'exact'` when the AI quote matched verbatim after normalising whitespace,
   * combining marks and bidi-mirrored brackets. `'partial'` when only a
   * letter-only fallback matched (because punctuation/letter order differed in
   * the PDF byte stream).
   */
  precision: 'exact' | 'partial';
}

interface RawLine {
  bbox: mupdf.Rect;
  chars: { ch: string; quad: mupdf.Quad }[];
}
interface RawBlock {
  bbox: mupdf.Rect;
  lines: RawLine[];
}

export function extractPageContent(
  doc: mupdf.PDFDocument,
  pageIdx: number,
  dpi = 300,
): PageContent {
  const page = doc.loadPage(pageIdx);

  const matrix = mupdf.Matrix.scale(dpi / 72, dpi / 72);
  // Force MediaBox so we always render the entire page, even when a CropBox
  // would clip part of it.
  const pixmap = page.toPixmap(
    matrix,
    mupdf.ColorSpace.DeviceRGB,
    false,
    true,
    'View',
    'MediaBox',
  );
  const imagePng = pixmap.asPNG();
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();

  const rawBlocks: RawBlock[] = [];
  let curBlock: RawBlock | null = null;
  let curLine: RawLine | null = null;

  page.toStructuredText('preserve-whitespace').walk({
    beginTextBlock(bbox) {
      curBlock = { bbox, lines: [] };
    },
    endTextBlock() {
      if (curBlock) rawBlocks.push(curBlock);
      curBlock = null;
    },
    beginLine(bbox) {
      curLine = { bbox, chars: [] };
    },
    endLine() {
      if (curLine && curBlock) curBlock.lines.push(curLine);
      curLine = null;
    },
    onChar(ch, _origin, _font, _size, quad) {
      curLine?.chars.push({ ch, quad });
    },
  });

  const blocks: TextBlock[] = [];
  for (const raw of rawBlocks) {
    const tb = assembleBlock(blocks.length, raw);
    if (tb) blocks.push(tb);
  }

  return { pageIdx, pageNum: pageIdx + 1, blocks, imagePng, width, height };
}

function assembleBlock(index: number, raw: RawBlock): TextBlock | null {
  if (raw.lines.length === 0) return null;

  let text = '';
  const quads: (mupdf.Quad | null)[] = [];
  let prevY: number | null = null;
  let prevH: number = 0;

  for (const line of raw.lines) {
    if (line.chars.length === 0) continue;
    const [, y0, , y1] = line.bbox;
    const h = y1 - y0;
    // Same visual line if the Y baseline is closer than half the previous
    // line's height — this rejoins runs that mupdf split for fragmented
    // typesetting (e.g. a title set glyph-by-glyph).
    if (prevY != null && Math.abs(y0 - prevY) > Math.max(2, prevH * 0.5)) {
      text += '\n';
      quads.push(null);
    }
    for (const c of line.chars) {
      text += c.ch;
      quads.push(c.quad);
    }
    prevY = y0;
    prevH = h;
  }

  if (!text.trim()) return null;

  const [x0, y0, x1, y1] = raw.bbox;
  return {
    index,
    bbox: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
    text,
    quads,
  };
}

/**
 * Bidi mirroring pairs: in RTL contexts the PDF text-extraction layer reports
 * `(` where the rendered glyph is visually `)`, and similarly for the other
 * mirroring pairs. Canonicalising every closer to its opener lets the search
 * match across that mismatch without removing the character (so the highlight
 * still covers the actual punctuation).
 */
const BIDI_MIRROR: Record<string, string> = {
  ')': '(',
  ']': '[',
  '}': '{',
  '>': '<',
};

/**
 * Build a normalised search key for `s` plus a map from each emitted character
 * back to its index in the original string. `keep` decides which original
 * characters contribute (after NFKD-decomposing and dropping combining marks).
 *   - exact mode: drop only whitespace, canonicalise mirrored brackets.
 *   - letters mode: drop everything except letters and digits — used as a
 *     fallback so AI quotes whose brackets/spaces sit in different positions
 *     than the PDF byte stream still locate.
 */
function buildSearchKey(
  s: string,
  mode: 'exact' | 'letters',
): { text: string; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) continue;
    const mapped = BIDI_MIRROR[c] ?? c;
    for (const dec of mapped.normalize('NFKD')) {
      if (/\p{M}/u.test(dec)) continue;
      if (mode === 'letters' && !/[\p{L}\p{N}]/u.test(dec)) continue;
      out.push(dec);
      map.push(i);
    }
  }
  return { text: out.join(''), map };
}

function tryFind(
  blocks: TextBlock[],
  target: string,
  mode: 'exact' | 'letters',
): TextMatch | null {
  const t = buildSearchKey(target, mode).text;
  if (!t) return null;
  for (const block of blocks) {
    const key = buildSearchKey(block.text, mode);
    const idx = key.text.indexOf(t);
    if (idx < 0) continue;
    const startChar = key.map[idx];
    const endChar = key.map[idx + t.length - 1] + 1;
    const quads: mupdf.Quad[] = [];
    for (let i = startChar; i < endChar; i++) {
      const q = block.quads[i];
      if (q) quads.push(q);
    }
    return {
      blockIdx: block.index,
      startChar,
      endChar,
      quads,
      precision: mode === 'exact' ? 'exact' : 'partial',
    };
  }
  return null;
}

/**
 * Locate `target` inside any single block. Tries an exact pass first
 * (whitespace, combining marks, and bidi-mirrored brackets normalised), then
 * falls back to a letter-only pass that ignores all punctuation/spacing in
 * the comparison while still mapping the highlight quads back to the original
 * characters (so brackets and commas are still covered visually).
 */
export function findText(blocks: TextBlock[], target: string): TextMatch | null {
  return tryFind(blocks, target, 'exact') ?? tryFind(blocks, target, 'letters');
}

export function formatBlocksForLLM(blocks: TextBlock[]): string {
  return blocks.map((b) => b.text).join('\n\n');
}
