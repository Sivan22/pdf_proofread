import type { Model, Route } from './settings';
import type { CostSource } from '../ai/pricing';

const STORAGE_KEY = 'pdf_proofread_run_history';
export const MAX_RUN_HISTORY = 50;

export interface RunRecord {
  timestamp: number;
  fileName: string;
  route: Route;
  model: Model;
  pageRange: string;
  batchesRun: number;
  pagesScanned: number;
  totalUsd: number;
  source: CostSource;
  tokens: {
    input: number;
    cachedRead: number;
    cacheWrite: number;
    output: number;
    reasoning: number;
  };
}

export function loadRunHistory(): RunRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as RunRecord[];
  } catch {
    return [];
  }
}

export function appendRunRecord(record: RunRecord): void {
  try {
    const next = [record, ...loadRunHistory()].slice(0, MAX_RUN_HISTORY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Silent — history is best-effort.
  }
}

export function clearRunHistory(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
}
