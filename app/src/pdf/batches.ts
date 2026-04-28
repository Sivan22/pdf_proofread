export function generateBatches(
  start: number,
  end: number,
  pagesPerBatch: number,
  overlap: number,
): number[][] {
  const step = Math.max(1, pagesPerBatch - overlap);
  const batches: number[][] = [];
  let cursor = start;
  let lastEnd = start;
  while (cursor < end) {
    const batchEnd = Math.min(cursor + pagesPerBatch, end);
    if (batches.length > 0 && batchEnd <= lastEnd) break;
    const batch: number[] = [];
    for (let p = cursor; p < batchEnd; p++) batch.push(p);
    batches.push(batch);
    lastEnd = batchEnd;
    cursor += step;
  }
  return batches;
}
