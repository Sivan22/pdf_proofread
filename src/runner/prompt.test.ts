import { describe, expect, it } from 'vitest';
import { DEFAULT_PROMPT, buildPrompt } from './prompt';

describe('buildPrompt', () => {
  it('substitutes batch_size', () => {
    const out = buildPrompt(DEFAULT_PROMPT, [4, 5, 6], {});
    expect(out).toContain('1 עד 3');
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
    const out = buildPrompt('check {batch_size}{existing_comments}', [0, 1], {});
    expect(out).toBe('check 2אין');
  });

  it('silently drops missing placeholders', () => {
    const out = buildPrompt('no placeholders here', [0], { 0: ['x'] });
    expect(out).toBe('no placeholders here');
  });
});
