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

interface RawChar {
  ch: string;
  quad: mupdf.Quad;
  font: string;
}
interface RawLine {
  bbox: mupdf.Rect;
  chars: RawChar[];
}
interface RawBlock {
  bbox: mupdf.Rect;
  lines: RawLine[];
}

/**
 * Some PDFs (typesetting tools that pre-date proper Unicode font support)
 * embed Hebrew via fonts with a CP1255-style codepage mapping and no
 * `ToUnicode` CMap. mupdf then reports the raw byte values as Latin-1
 * supplement characters: e.g. `øäåæ` for what visually renders as `זוהר`.
 * The bytes 0xE0-0xFA line up 1-to-1 with U+05D0-U+05EA, and the runs are
 * stored visual-LTR (so a logical Hebrew word looks reversed). Mapping
 * the bytes plus reversing the run recovers real Hebrew.
 *
 * We work at the **run** level inside a line, not the whole line —
 * footnotes commonly mix one good-Hebrew sentence with a glyph-encoded
 * citation, and reversing real Hebrew would corrupt it. A run is a
 * contiguous sequence of Latin-1 supplement bytes (allowing intervening
 * ASCII whitespace/punctuation, which a CP1255 font also emits as ASCII
 * codepoints).
 */
function isCp1255Hebrew(cp: number): boolean {
  return cp >= 0xE0 && cp <= 0xFA;
}
function isLatin1Mojibake(cp: number): boolean {
  return cp >= 0x00C0 && cp <= 0x00FF;
}
function isAsciiPrintable(cp: number): boolean {
  return cp >= 0x20 && cp <= 0x7E;
}

/**
 * Some Hebrew typesetting fonts spell nikkud as ASCII upper-letter glyph
 * slots (F, H, N, U, X, Y, Q, R, S, T, V, W, Z) and as Latin-1 chars in
 * the 0xC0-0xDF / 0xFB-0xFF range. After demojibake those are still in
 * the stream and would corrupt the searches. We strip them block-by-block
 * (not line-by-line) so a line of pure noise inside an otherwise-Hebrew
 * block also gets cleaned. Blocks with no Hebrew at all are left alone
 * — that preserves legitimate accented-Latin documents.
 */
function stripNikkudGlyphsInBlock(raw: RawBlock): void {
  const isHeb = (cp: number) => cp >= 0x0590 && cp <= 0x05FF;
  let hebCount = 0;
  for (const line of raw.lines) {
    for (const c of line.chars) {
      if (isHeb(c.ch.codePointAt(0) ?? 0)) hebCount++;
    }
  }
  if (hebCount === 0) return;
  for (const line of raw.lines) {
    line.chars = line.chars.filter((c) => {
      const cp = c.ch.codePointAt(0) ?? 0;
      // Latin-1 supplement chars left after demojibake are unmapped font
      // noise (the font's nikkud-glyph slots).
      if (cp >= 0x00A0 && cp <= 0x00FF) return false;
      // Any Latin letter inside a Hebrew block is — virtually always — a
      // nikkud glyph slot (Q, U, X, c, etc.). Real English words are rare
      // in a Hebrew document and the trade-off keeps searches clean.
      if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) return false;
      // Underscore — common vowel-mark slot.
      if (cp === 0x5F) return false;
      return true;
    });
  }
}

/**
 * Per-font glyph-slot mappings for Hebrew typesetting fonts that route some
 * letters through ASCII or extended-Latin codepoints (no `ToUnicode` CMap
 * to recover them).
 *
 * Key is a substring of the mupdf-reported font name (after the `+` subset
 * prefix). Value maps a single source char to its Hebrew letter — empty
 * string means "drop this glyph slot" (typically a nikkud / cantillation
 * mark we don't need for proofreading).
 *
 * Today we know the "Z_*" Bnei Baruch–style fonts: F and H are forms of
 * ש (with shin/sin dot baked in), X is י, the rest are vocalisation glyphs.
 * Add more entries here as we encounter new fonts.
 */
/**
 * Glyph-slot map for the Z_FR / Z_Vilna / Z_Margalit Hebrew typesetting
 * fonts (Bnei-Baruch / "Hasulam" lineage). Derived from the publisher's
 * own `Z_PREVIW.MAP` font definition: the font hosts dagesh-bearing /
 * shin-dot / vowel-aware letterforms in ASCII codepoints, so the byte
 * mupdf reports back doesn't directly mean its ASCII letter.
 *
 * Every entry below is the consonant the slot represents — dagesh and
 * shin/sin distinctions get folded back onto the bare letter, since
 * proofreading only cares about consonants. ASCII bracket/punctuation
 * slots (76, 78, 80, 100, 101, 102, 103) keep their normal meaning and
 * are left out so they pass through unchanged.
 */
const Z_FONT_LETTER_MAP: Record<string, string> = {
  A: 'ו', // vav with holam
  B: 'ך', // final-kaf with sheva
  C: 'ך', // final-kaf with qamats
  F: 'ש', // shin with shin-dot (Rshin)
  G: 'ש', // Rshin + dagesh
  H: 'ש', // shin with sin-dot (Lshin)
  I: 'ש', // Lshin + dagesh
  Q: 'ב', // bet + dagesh
  R: 'ג', // gimel + dagesh
  S: 'ד', // dalet + dagesh
  T: 'ה', // he + dagesh
  U: 'ו', // vav + dagesh
  V: 'ז', // zayin + dagesh
  W: 'ט', // tet + dagesh
  X: 'י', // yod + dagesh
  Y: 'ך', // final-kaf + dagesh
  Z: 'כ', // kaf + dagesh
  '[': 'ל', // lamed + dagesh
  '\\': 'מ', // mem + dagesh
  ']': 'נ', // nun + dagesh
  '^': 'ס', // samekh + dagesh
  _: 'פ', // pe + dagesh
  '`': 'צ', // sade + dagesh
  a: 'ק', // qof + dagesh
  c: 'ת', // tav + dagesh
};

const FONT_GLYPH_MAP: Record<string, Record<string, string>> = {
  Z_FR: Z_FONT_LETTER_MAP,
  Z_Vilna: Z_FONT_LETTER_MAP,
  Z_Margalit: Z_FONT_LETTER_MAP,
};

function fontGlyph(fontName: string, ch: string): string | undefined {
  for (const key of Object.keys(FONT_GLYPH_MAP)) {
    if (fontName.includes(key)) {
      return FONT_GLYPH_MAP[key][ch];
    }
  }
  return undefined;
}

/**
 * Some Hebrew PDFs (especially typesetters that place each glyph at an absolute
 * coordinate) emit chars in a stream order that does not match logical reading
 * order — letters within a word can appear shuffled, which destroys substring
 * matching and confuses the LLM. Sorting a Hebrew-dominant visual line by
 * X-position (right→left) recovers logical order in those cases.
 *
 * We only sort when stream order is *clearly* out of step with on-page X
 * positions — a majority of adjacent char-pairs must be out of RTL order.
 * Otherwise we trust the stream, since well-typeset PDFs already deliver chars
 * in logical order and re-sorting on small kerning differences can corrupt
 * adjacent letters.
 *
 * Runs after CP1255 demojibake so the chars we sort are real Hebrew Unicode.
 */
function sortCharsByVisualOrder(chars: RawChar[]): void {
  if (chars.length < 2) return;
  let hebCount = 0;
  let latCount = 0;
  for (const c of chars) {
    const cp = c.ch.codePointAt(0) ?? 0;
    if (cp >= 0x0590 && cp <= 0x05FF) hebCount++;
    else if ((cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A)) latCount++;
  }
  if (hebCount === 0 || latCount >= hebCount) return;

  const xCenter = (q: mupdf.Quad): number => {
    const a = q as unknown as number[];
    return (a[0] + a[2] + a[4] + a[6]) / 4;
  };

  // Adjacent-pair inversion count vs RTL expectation: in RTL the prior char's
  // X-center should exceed the next char's. Tolerance of 1pt absorbs subpixel
  // jitter and harmless kerning overlaps. Sorting kicks in only when at least
  // a fifth of pairs are clearly inverted — that's the "shuffled glyph stream"
  // signature; ordinary Hebrew text scores near zero.
  let inverted = 0;
  for (let i = 1; i < chars.length; i++) {
    const dx = xCenter(chars[i - 1].quad) - xCenter(chars[i].quad);
    if (dx < -1) inverted++;
  }
  if (inverted * 5 < chars.length - 1) return;

  chars.sort((a, b) => xCenter(b.quad) - xCenter(a.quad));
}

function fixMojibakeRuns(chars: RawChar[]): RawChar[] {
  const result: RawChar[] = [];
  let i = 0;
  while (i < chars.length) {
    const cp = chars[i].ch.codePointAt(0) ?? 0;
    // Anchor a run on a Latin-1 char that's in the CP1255 Hebrew block.
    if (!isCp1255Hebrew(cp)) {
      result.push(chars[i]);
      i++;
      continue;
    }
    // Extend greedily while we keep seeing CP1255 Hebrew, Latin-1 bytes
    // or ASCII printables. This captures glyph-encoded Hebrew with
    // embedded ASCII spaces/quotes/digits.
    let j = i;
    while (j < chars.length) {
      const c = chars[j].ch.codePointAt(0) ?? 0;
      if (isCp1255Hebrew(c) || isAsciiPrintable(c) || isLatin1Mojibake(c)) {
        j++;
      } else {
        break;
      }
    }
    // Trim trailing chars that aren't CP1255 Hebrew — they probably
    // belong to the next, real-Hebrew run.
    while (j > i + 1) {
      const c = chars[j - 1].ch.codePointAt(0) ?? 0;
      if (isCp1255Hebrew(c) || isLatin1Mojibake(c)) break;
      j--;
    }

    const run: RawChar[] = [];
    for (let k = i; k < j; k++) {
      const c = chars[k];
      const cp2 = c.ch.codePointAt(0) ?? 0;
      if (isCp1255Hebrew(cp2)) {
        run.push({ ...c, ch: String.fromCodePoint(cp2 - 0xE0 + 0x05D0) });
        continue;
      }
      // ASCII letters / underscore / extended-Latin: consult the font
      // glyph map. Empty string means "drop"; non-empty maps to a
      // recovered Hebrew letter; undefined falls through.
      const mapped = fontGlyph(c.font, c.ch);
      if (mapped !== undefined) {
        if (mapped) run.push({ ...c, ch: mapped });
        continue;
      }
      // Default: keep ASCII printable, drop anything else. The strip
      // pass below will scrub remaining noise at block level.
      if (isAsciiPrintable(cp2)) run.push(c);
    }
    run.reverse();
    result.push(...run);
    i = j;
  }
  return result;
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
      if (curLine && curBlock) {
        curLine.chars = fixMojibakeRuns(curLine.chars);
        curBlock.lines.push(curLine);
      }
      curLine = null;
    },
    onChar(ch, _origin, font, _size, quad) {
      const fontName = (font && typeof font.getName === 'function' ? font.getName() : '') ?? '';
      curLine?.chars.push({ ch, quad, font: fontName });
    },
  });

  for (const raw of rawBlocks) {
    stripNikkudGlyphsInBlock(raw);
  }

  const blocks: TextBlock[] = [];
  for (const raw of rawBlocks) {
    const tb = assembleBlock(blocks.length, raw);
    if (tb) blocks.push(tb);
  }

  return { pageIdx, pageNum: pageIdx + 1, blocks, imagePng, width, height };
}

function assembleBlock(index: number, raw: RawBlock): TextBlock | null {
  if (raw.lines.length === 0) return null;

  // Group lines by visual baseline. Two mupdf-lines belong to the same visual
  // line when their Y baselines are close enough — typesetters that emit each
  // glyph or word as a separate run land here, and so do titles set glyph-by-
  // glyph. Once grouped, we sort chars in the group by X (right→left for
  // Hebrew-dominant groups), which recovers logical reading order even when
  // mupdf's stream order shuffles letters within a word.
  const groups: { chars: RawChar[]; h: number }[] = [];
  let prevY: number | null = null;
  let prevH = 0;
  for (const line of raw.lines) {
    if (line.chars.length === 0) continue;
    const [, y0, , y1] = line.bbox;
    const h = y1 - y0;
    if (prevY != null && Math.abs(y0 - prevY) <= Math.max(2, prevH * 0.5)) {
      groups[groups.length - 1].chars.push(...line.chars);
      groups[groups.length - 1].h = Math.max(groups[groups.length - 1].h, h);
    } else {
      groups.push({ chars: [...line.chars], h });
    }
    prevY = y0;
    prevH = h;
  }

  let text = '';
  const quads: (mupdf.Quad | null)[] = [];
  for (let i = 0; i < groups.length; i++) {
    sortCharsByVisualOrder(groups[i].chars);
    if (i > 0) {
      text += '\n';
      quads.push(null);
    }
    for (const c of groups[i].chars) {
      text += c.ch;
      quads.push(c.quad);
    }
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
