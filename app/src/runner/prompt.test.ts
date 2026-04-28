import { describe, expect, it } from 'vitest';
import { DEFAULT_PROMPT, buildPrompt } from './prompt';

describe('buildPrompt', () => {
  it('uses singular page_context for one-page batches', () => {
    const out = buildPrompt(DEFAULT_PROMPT, [4], {});
    expect(out).toContain('הנה התוכן של הדף: עמוד 5');
    expect(out).not.toMatch(/עמודים \d/);
  });

  it('uses plural page_context for multi-page batches', () => {
    const out = buildPrompt(DEFAULT_PROMPT, [4, 5, 6], {});
    expect(out).toContain('הנה התוכן של הדף: עמודים 5-7');
  });

  it('substitutes existing-comments with "אין" when none are passed', () => {
    const out = buildPrompt(DEFAULT_PROMPT, [0], {});
    expect(out).toContain('הנה הערות קיימות: אין');
  });

  it('injects existing-comments mapped to local 1-indexed pages', () => {
    const out = buildPrompt(DEFAULT_PROMPT, [9, 10], { 10: ['note A', 'note B'] });
    expect(out).toContain('עמוד 2: note A');
    expect(out).toContain('עמוד 2: note B');
    expect(out).toContain('הנה הערות קיימות: עמוד 2: note A');
  });

  it('replaces a custom template with placeholders', () => {
    const out = buildPrompt('check {page_context}{existing_comments}', [0], {});
    expect(out).toBe('check עמוד 1אין');
  });

  it('silently drops missing placeholders', () => {
    const out = buildPrompt('no placeholders here', [0], { 0: ['x'] });
    expect(out).toBe('no placeholders here');
  });
});
