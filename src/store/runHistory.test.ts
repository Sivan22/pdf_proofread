import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendRunRecord, clearRunHistory, loadRunHistory, MAX_RUN_HISTORY } from './runHistory';

beforeEach(() => {
  const data = new Map<string, string>();
  globalThis.localStorage = {
    getItem(k: string) { return data.get(k) ?? null; },
    setItem(k: string, v: string) { data.set(k, v); },
    removeItem(k: string) { data.delete(k); },
    clear() { data.clear(); },
    key(i: number) { return [...data.keys()][i] ?? null; },
    get length() { return data.size; },
  } as unknown as Storage;
});

afterEach(() => localStorage.clear());

const REC = {
  fileName: 'doc.pdf',
  route: 'gateway' as const,
  model: 'claude-opus-4-7' as const,
  pageRange: '1-10',
  batchesRun: 5,
  pagesScanned: 10,
  totalUsd: 0.12,
  source: 'gateway-exact' as const,
  tokens: { input: 1000, cachedRead: 0, cacheWrite: 0, output: 200, reasoning: 0 },
};

describe('run history store', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(loadRunHistory()).toEqual([]);
  });

  it('appends in newest-first order', () => {
    appendRunRecord({ ...REC, fileName: 'a.pdf', timestamp: 1 });
    appendRunRecord({ ...REC, fileName: 'b.pdf', timestamp: 2 });
    const list = loadRunHistory();
    expect(list[0].fileName).toBe('b.pdf');
    expect(list[1].fileName).toBe('a.pdf');
  });

  it('caps at MAX_RUN_HISTORY entries, dropping the oldest', () => {
    for (let i = 0; i < MAX_RUN_HISTORY + 5; i++) {
      appendRunRecord({ ...REC, fileName: `f${i}.pdf`, timestamp: i });
    }
    const list = loadRunHistory();
    expect(list).toHaveLength(MAX_RUN_HISTORY);
    expect(list[0].fileName).toBe(`f${MAX_RUN_HISTORY + 4}.pdf`);
  });

  it('clears all entries', () => {
    appendRunRecord({ ...REC, timestamp: 1 });
    clearRunHistory();
    expect(loadRunHistory()).toEqual([]);
  });

  it('returns [] if storage contains malformed JSON', () => {
    localStorage.setItem('pdf_proofread_run_history', '{not json');
    expect(loadRunHistory()).toEqual([]);
  });
});
