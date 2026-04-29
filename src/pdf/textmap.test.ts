import { describe, expect, it } from 'vitest';
import type { Quad } from 'mupdf';
import { findText, type TextBlock } from './textmap';

const Q = (n: number): Quad => [n, 0, n + 1, 0, n, 1, n + 1, 1];

function block(text: string, idx = 0): TextBlock {
  const quads: (Quad | null)[] = [];
  for (let i = 0; i < text.length; i++) {
    quads.push(text[i] === '\n' ? null : Q(i));
  }
  return { index: idx, bbox: { x: 0, y: 0, w: 100, h: 10 }, text, quads };
}

describe('findText', () => {
  it('matches a contiguous run inside a block', () => {
    const m = findText([block('hello world')], 'world');
    expect(m).not.toBeNull();
    expect(m!.blockIdx).toBe(0);
    expect(m!.startChar).toBe(6);
    expect(m!.endChar).toBe(11);
    expect(m!.quads).toHaveLength(5);
    expect(m!.precision).toBe('exact');
  });

  it('canonicalises bidi-mirrored brackets', () => {
    // PDF stores ")אות שלה(" while the AI quotes "(אות שלה)" — same letters,
    // just the bracket pair flipped. Should still match exactly.
    const m = findText([block('בפקודי)אות שלה(בענין')], '(אות שלה)');
    expect(m).not.toBeNull();
    expect(m!.precision).toBe('exact');
  });

  it('falls back to letter-only matching when punctuation positions differ', () => {
    // PDF: "בפקודי)אות שלה(", AI: "בפקודי א( ות שלה)" — same letters but the
    // א has shifted across the bracket. Bracket canonicalisation alone won't
    // make these substring-equal, but the letter-only fallback will.
    const m = findText([block('בפקודי)אות שלה(בענין')], 'בפקודי א( ות שלה)');
    expect(m).not.toBeNull();
    expect(m!.precision).toBe('partial');
    // Highlight still spans the original bracket characters.
    expect(m!.quads.length).toBeGreaterThan(0);
  });

  it('matches Hebrew presentation forms against base+combining encoding', () => {
    // PDF uses precomposed וּ (U+FB35), AI quotes ו + combining dagesh.
    const m = findText([block('שהרעוּ לישראל')], 'שהרעוּ');
    expect(m).not.toBeNull();
    expect(m!.precision).toBe('exact');
  });

  it('strips whitespace on both sides of the comparison', () => {
    // Simulates the "סיכום הלכוח ת מקח" case: text has a stray space, target does not.
    const b = block('סיכום הלכוח ת מקח וממכר');
    const m = findText([b], 'הלכוחת');
    expect(m).not.toBeNull();
    expect(m!.quads.length).toBe(7); // ה-ל-כ-ו-ח-ת (no quad for the swallowed space)
  });

  it('matches across an inserted line break inside a block', () => {
    // Whitespace stripped includes the \n separator we add between visual lines.
    const b = block('סיכום הלכו\nח ת מקח וממכר');
    const m = findText([b], 'הלכוחת');
    expect(m).not.toBeNull();
    // Span covers ה,ל,כ,ו,\n(null),ח, ,ת — 7 quads (the inserted \n contributes none).
    expect(m!.quads.length).toBe(7);
  });

  it('does not match across blocks', () => {
    const blocks = [block('foo bar', 0), block('baz qux', 1)];
    expect(findText(blocks, 'bar baz')).toBeNull();
  });

  it('returns null when target is whitespace-only', () => {
    expect(findText([block('hello')], '   ')).toBeNull();
  });
});
