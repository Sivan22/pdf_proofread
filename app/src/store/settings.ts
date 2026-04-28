export type Route = 'anthropic' | 'google' | 'gateway';
export type Model = 'claude-opus-4-7' | 'gemini-3.1-pro';

export interface Settings {
  route: Route;
  model: Model;
  apiKeys: { anthropic: string; google: string; gateway: string };
  pagesPerBatch: number;
  overlap: number;
  concurrency: number;
  prompt: string;
  startPage?: number;
  endPage?: number;
}

const STORAGE_KEY = 'pdf_proofread_settings';

export const DEFAULT_SETTINGS: Settings = {
  route: 'gateway',
  model: 'gemini-3.1-pro',
  apiKeys: { anthropic: '', google: '', gateway: '' },
  pagesPerBatch: 1,
  overlap: 0,
  concurrency: 4,
  prompt: '',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      apiKeys: { ...DEFAULT_SETTINGS.apiKeys, ...(parsed.apiKeys ?? {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Silent — settings will be lost on reload.
  }
}
