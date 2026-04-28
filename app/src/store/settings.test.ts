import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settings';

beforeEach(() => {
  // jsdom or happy-dom localStorage shim
  globalThis.localStorage = {
    _data: new Map<string, string>(),
    getItem(k: string) { return this._data.get(k) ?? null; },
    setItem(k: string, v: string) { this._data.set(k, v); },
    removeItem(k: string) { this._data.delete(k); },
    clear() { this._data.clear(); },
    key(i: number) { return [...this._data.keys()][i] ?? null; },
    get length() { return this._data.size; },
  } as unknown as Storage;
});

afterEach(() => {
  localStorage.clear();
});

describe('settings store', () => {
  it('returns defaults when nothing is stored', () => {
    const s = loadSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through save/load', () => {
    const updated = {
      ...DEFAULT_SETTINGS,
      route: 'google' as const,
      model: 'gemini-3.1-pro' as const,
      apiKeys: { anthropic: '', google: 'g-key', gateway: '' },
      pagesPerBatch: 5,
      overlap: 1,
      concurrency: 2,
    };
    saveSettings(updated);
    expect(loadSettings()).toEqual(updated);
  });

  it('merges stored settings over defaults so new fields stay populated', () => {
    localStorage.setItem('pdf_proofread_settings', JSON.stringify({ route: 'anthropic' }));
    const s = loadSettings();
    expect(s.route).toBe('anthropic');
    expect(s.pagesPerBatch).toBe(DEFAULT_SETTINGS.pagesPerBatch);
    expect(s.prompt).toBe(DEFAULT_SETTINGS.prompt);
  });
});
