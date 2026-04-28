import { describe, expect, it } from 'vitest';
import { generateBatches } from './batches';

describe('generateBatches', () => {
  it('yields single-page batches by default', () => {
    expect(generateBatches(0, 3, 1, 0)).toEqual([[0], [1], [2]]);
  });

  it('respects pagesPerBatch with no overlap', () => {
    expect(generateBatches(0, 6, 3, 0)).toEqual([[0, 1, 2], [3, 4, 5]]);
  });

  it('handles overlap', () => {
    expect(generateBatches(0, 5, 3, 1)).toEqual([[0, 1, 2], [2, 3, 4]]);
  });

  it('clamps the last batch when end is not divisible', () => {
    expect(generateBatches(0, 5, 3, 0)).toEqual([[0, 1, 2], [3, 4]]);
  });

  it('respects start offset', () => {
    expect(generateBatches(2, 5, 2, 0)).toEqual([[2, 3], [4]]);
  });

  it('coerces overlap >= pagesPerBatch into step=1 (no infinite loop)', () => {
    expect(generateBatches(0, 4, 2, 5)).toEqual([[0, 1], [1, 2], [2, 3]]);
  });

  it('returns empty when start >= end', () => {
    expect(generateBatches(3, 3, 1, 0)).toEqual([]);
  });
});
