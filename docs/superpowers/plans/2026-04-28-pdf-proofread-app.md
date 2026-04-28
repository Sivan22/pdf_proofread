# PDF Proofread Stage 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static client-side React app that proofreads Hebrew PDFs by sending pages to Anthropic / Google / Vercel AI Gateway and writing the model's findings back as PDF annotations, then offers the annotated PDF + a JSON of findings for download.

**Architecture:** Vite + React + TypeScript SPA. `mupdf` (WASM) for PDF read / search / annotate / save. Vercel AI SDK v6 with `@ai-sdk/anthropic`, `@ai-sdk/google`, and `@ai-sdk/openai` (configured for the Vercel AI Gateway). All compute and key storage in the browser. No backend.

**Tech Stack:** TypeScript 5+, React 19, Vite 6+, vitest, `mupdf`, `ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`.

**Spec:** `docs/superpowers/specs/2026-04-28-pdf-proofread-app-design.md`

**TDD scope:** Unit-test the pure logic modules (`batches`, `prompt`, `providers/resolveModelId`, `store/settings`). The `mupdf` wrapper, AI calls, and UI components are validated manually at the end (the spec marks these as I/O-bound and they rely on WASM / network / DOM).

**Working directory for all commands:** `/root/pdf_proofread/app/` unless stated otherwise.

---

### Task 1: Scaffold Vite + React + TypeScript app

**Files:**
- Create: `app/package.json`
- Create: `app/tsconfig.json`
- Create: `app/tsconfig.node.json`
- Create: `app/vite.config.ts`
- Create: `app/index.html`
- Create: `app/src/main.tsx`
- Create: `app/src/App.tsx`
- Create: `app/.gitignore`

- [ ] **Step 1: Create `app/package.json`**

```json
{
  "name": "pdf-proofread-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@ai-sdk/anthropic": "^3.0.71",
    "@ai-sdk/google": "^3.0.39",
    "@ai-sdk/openai": "^3.0.53",
    "ai": "^6.0.168",
    "mupdf": "^1.3.0",
    "react": "^19.2.5",
    "react-dom": "^19.2.5"
  },
  "devDependencies": {
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "typescript": "^5.6.3",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `app/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `app/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `app/vite.config.ts`**

`mupdf` ships a WASM file that must be served as-is. `optimizeDeps.exclude` keeps Vite from trying to bundle the WASM glue. `base` reads from `VITE_BASE` so the GH Pages workflow can set the repo subpath.

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['mupdf'],
  },
});
```

- [ ] **Step 5: Create `app/index.html`**

```html
<!doctype html>
<html lang="he" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PDF Proofread</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `app/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Create `app/src/App.tsx`** (placeholder; real UI lands in Task 14)

```tsx
export default function App() {
  return <div style={{ padding: 24 }}>PDF Proofread — scaffolding ready</div>;
}
```

- [ ] **Step 8: Create `app/.gitignore`**

```
node_modules
dist
.vite
```

- [ ] **Step 9: Install and smoke-test**

Run from `app/`:

```bash
npm install
npm run build
```

Expected: `npm install` completes; `npm run build` produces `app/dist/` with no TS errors.

- [ ] **Step 10: Commit**

```bash
cd /root/pdf_proofread
git add app/
git commit -m "Scaffold Vite + React + TS app for PDF proofread"
```

---

### Task 2: Settings store

**Files:**
- Create: `app/src/store/settings.ts`
- Create: `app/src/store/settings.test.ts`

- [ ] **Step 1: Write failing tests** in `app/src/store/settings.test.ts`

```ts
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
```

Add a vitest config so the polyfilled localStorage works. Add to `app/package.json`:

```json
"vitest": { "environment": "node" }
```

(We keep the env minimal — the polyfill above suffices for these tests.)

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd app && npm test
```

Expected: failures because `./settings` does not exist yet.

- [ ] **Step 3: Implement** `app/src/store/settings.ts`

`prompt` defaults to an empty string here to avoid a circular task dependency on the prompt module. `App.tsx` (Task 15) populates it with `DEFAULT_PROMPT` on first load when it is empty.

```ts
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
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd app && npm test
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/store/
git commit -m "Add settings store with localStorage persistence"
```

---

### Task 3: Default prompt + placeholder substitution

**Files:**
- Create: `app/src/runner/prompt.ts`
- Create: `app/src/runner/prompt.test.ts`

- [ ] **Step 1: Write failing tests** in `app/src/runner/prompt.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_PROMPT, buildPrompt } from './prompt';

describe('buildPrompt', () => {
  it('uses singular page_context for one-page batches', () => {
    const out = buildPrompt(DEFAULT_PROMPT, [4], {});
    expect(out).toContain('עמוד 5');
    expect(out).not.toContain('עמודים');
  });

  it('uses plural page_context for multi-page batches', () => {
    const out = buildPrompt(DEFAULT_PROMPT, [4, 5, 6], {});
    expect(out).toContain('עמודים 5-7');
  });

  it('omits the existing-comments block when none are passed', () => {
    const out = buildPrompt(DEFAULT_PROMPT, [0], {});
    expect(out).not.toContain('הערות קיימות');
  });

  it('injects existing-comments mapped to local 1-indexed pages', () => {
    const out = buildPrompt(DEFAULT_PROMPT, [9, 10], { 10: ['note A', 'note B'] });
    expect(out).toContain('הערות קיימות');
    expect(out).toContain('עמוד 2: note A');
    expect(out).toContain('עמוד 2: note B');
  });

  it('replaces a custom template with placeholders', () => {
    const out = buildPrompt('check {page_context}{existing_comments}', [0], {});
    expect(out).toBe('check עמוד 1');
  });

  it('silently drops missing placeholders', () => {
    const out = buildPrompt('no placeholders here', [0], { 0: ['x'] });
    expect(out).toBe('no placeholders here');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd app && npm test -- prompt
```

Expected: module not found.

- [ ] **Step 3: Implement** `app/src/runner/prompt.ts`

```ts
export const DEFAULT_PROMPT = `בדוק את {page_context} ומצא טעויות טכניות ברורות.


חפש רק טעויות טכניות ברורות:

1. מילים כפולות ברצף (אותה מילה פעמיים רצוף)
2. סימני פיסוק כפולים (,, או :: או ..)
3. אות חסרה או מיותרת באופן ברור במילה
4. טעויות ברצף מספרים או אותיות (א', ב', ג', ד', ד', ו' במקום א', ב', ג', ד', ה', ו')
5. סימני שאלה (?) שנותרו בטקסט כסימון לעורכים
6. מראי מקומות שגויים (פרק/פסוק/דף שגויים)
7. רווח מיותר לפני או אחרי סוגריים
8. כפילויות - אותו טקסט מופיע פעמיים

אל תדווח על:
- דקדוק, סגנון, עקביות כתיב, או החלטות עריכה
- כתיב יידיש
- סגנון לשון הקודש עתיק

== חשוב ==
רק טעויות ודאיות וברורות. אל תכניס דברים סתם.

אם אין טעויות ודאיות, החזר: []

אם יש, החזר JSON בלבד:
[{"page": <מספר עמוד בPDF>, "text": "הטקסט המדויק מהעמוד", "error": "תיאור קצר", "fix": "התיקון"}]

שים לב: מספר העמוד הוא המספר בתוך ה-PDF ששלחתי (1 עד {batch_size}), לא המספר המקורי.{existing_comments}`;

function pageContext(pageNums: number[]): string {
  if (pageNums.length === 1) return `עמוד ${pageNums[0] + 1}`;
  return `עמודים ${pageNums[0] + 1}-${pageNums[pageNums.length - 1] + 1}`;
}

function existingCommentsBlock(
  pageNums: number[],
  existing: Record<number, string[]>,
): string {
  const lines: string[] = [];
  for (const pageNum of pageNums) {
    const comments = existing[pageNum];
    if (!comments?.length) continue;
    const localPage = pageNums.indexOf(pageNum) + 1;
    for (const comment of comments) {
      lines.push(`עמוד ${localPage}: ${comment}`);
    }
  }
  if (!lines.length) return '';
  return '\n\nהערות קיימות על העמודים (אל תחזור עליהן):\n' + lines.join('\n');
}

export function buildPrompt(
  template: string,
  pageNums: number[],
  existing: Record<number, string[]>,
): string {
  return template
    .replaceAll('{page_context}', pageContext(pageNums))
    .replaceAll('{batch_size}', String(pageNums.length))
    .replaceAll('{existing_comments}', existingCommentsBlock(pageNums, existing));
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd app && npm test -- prompt
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/runner/
git commit -m "Add Hebrew default prompt and placeholder substitution"
```

---

### Task 4: Batch generator

**Files:**
- Create: `app/src/pdf/batches.ts`
- Create: `app/src/pdf/batches.test.ts`

- [ ] **Step 1: Write failing tests** in `app/src/pdf/batches.test.ts`

```ts
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
```

- [ ] **Step 2: Run tests to confirm fail**

```bash
cd app && npm test -- batches
```

- [ ] **Step 3: Implement** `app/src/pdf/batches.ts`

```ts
export function generateBatches(
  start: number,
  end: number,
  pagesPerBatch: number,
  overlap: number,
): number[][] {
  const step = Math.max(1, pagesPerBatch - overlap);
  const batches: number[][] = [];
  let cursor = start;
  while (cursor < end) {
    const batchEnd = Math.min(cursor + pagesPerBatch, end);
    const batch: number[] = [];
    for (let p = cursor; p < batchEnd; p++) batch.push(p);
    batches.push(batch);
    cursor += step;
  }
  return batches;
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd app && npm test -- batches
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/pdf/
git commit -m "Add batch generator with overlap support"
```

---

### Task 5: Provider/model resolution

**Files:**
- Create: `app/src/ai/providers.ts`
- Create: `app/src/ai/providers.test.ts`

- [ ] **Step 1: Write failing tests** in `app/src/ai/providers.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { resolveModelId, isRouteModelValid } from './providers';

describe('resolveModelId', () => {
  it('maps Anthropic direct route', () => {
    expect(resolveModelId('anthropic', 'claude-opus-4-7')).toBe('claude-opus-4-7');
  });

  it('maps Google direct route to the preview suffix', () => {
    expect(resolveModelId('google', 'gemini-3.1-pro')).toBe('gemini-3.1-pro-preview');
  });

  it('prefixes Gateway-routed Anthropic', () => {
    expect(resolveModelId('gateway', 'claude-opus-4-7')).toBe('anthropic/claude-opus-4-7');
  });

  it('prefixes Gateway-routed Google', () => {
    expect(resolveModelId('gateway', 'gemini-3.1-pro')).toBe('google/gemini-3.1-pro-preview');
  });

  it('rejects an unsupported (route, model) pair', () => {
    expect(() => resolveModelId('anthropic', 'gemini-3.1-pro')).toThrow();
    expect(() => resolveModelId('google', 'claude-opus-4-7')).toThrow();
  });
});

describe('isRouteModelValid', () => {
  it('flags supported pairs', () => {
    expect(isRouteModelValid('anthropic', 'claude-opus-4-7')).toBe(true);
    expect(isRouteModelValid('google', 'gemini-3.1-pro')).toBe(true);
    expect(isRouteModelValid('gateway', 'claude-opus-4-7')).toBe(true);
    expect(isRouteModelValid('gateway', 'gemini-3.1-pro')).toBe(true);
  });

  it('flags unsupported pairs', () => {
    expect(isRouteModelValid('anthropic', 'gemini-3.1-pro')).toBe(false);
    expect(isRouteModelValid('google', 'claude-opus-4-7')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm fail**

```bash
cd app && npm test -- providers
```

- [ ] **Step 3: Implement** `app/src/ai/providers.ts`

```ts
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { Model, Route, Settings } from '../store/settings';

const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1';

const DIRECT_MODEL_ID: Record<Route, Partial<Record<Model, string>>> = {
  anthropic: { 'claude-opus-4-7': 'claude-opus-4-7' },
  google:    { 'gemini-3.1-pro': 'gemini-3.1-pro-preview' },
  gateway:   {
    'claude-opus-4-7': 'anthropic/claude-opus-4-7',
    'gemini-3.1-pro':  'google/gemini-3.1-pro-preview',
  },
};

export function isRouteModelValid(route: Route, model: Model): boolean {
  return DIRECT_MODEL_ID[route]?.[model] !== undefined;
}

export function resolveModelId(route: Route, model: Model): string {
  const id = DIRECT_MODEL_ID[route]?.[model];
  if (!id) {
    throw new Error(`Model "${model}" is not available on route "${route}".`);
  }
  return id;
}

export function createModel(settings: Settings): LanguageModel {
  const id = resolveModelId(settings.route, settings.model);
  switch (settings.route) {
    case 'anthropic': {
      const key = settings.apiKeys.anthropic;
      if (!key) throw new Error('Anthropic API key is required.');
      const provider = createAnthropic({
        apiKey: key,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
      });
      return provider(id);
    }
    case 'google': {
      const key = settings.apiKeys.google;
      if (!key) throw new Error('Google API key is required.');
      const provider = createGoogleGenerativeAI({ apiKey: key });
      return provider(id);
    }
    case 'gateway': {
      const key = settings.apiKeys.gateway;
      if (!key) throw new Error('Gateway API key is required.');
      const provider = createOpenAI({ apiKey: key, baseURL: GATEWAY_BASE_URL });
      return provider(id);
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd app && npm test -- providers
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/ai/
git commit -m "Add provider routing and model ID resolution"
```

---

### Task 6: mupdf wrapper (PDF read/search/annotate)

**Files:**
- Create: `app/src/pdf/mupdf.ts`

This wrapper is exercised through the orchestrator end-to-end manual test (Task 15). Pure-unit testing of mupdf is impractical (WASM init + binary fixtures); the function shapes are small and obvious enough that the manual run is the validation.

- [ ] **Step 1: Implement** `app/src/pdf/mupdf.ts`

```ts
import * as mupdf from 'mupdf';

export interface ProofError {
  page: number;
  text: string;
  error: string;
  fix: string;
  match: 'exact' | 'partial' | 'unmatched';
}

export interface OpenedPdf {
  doc: mupdf.PDFDocument;
  pageCount: number;
}

export async function openPdf(bytes: ArrayBuffer): Promise<OpenedPdf> {
  const buffer = new Uint8Array(bytes);
  const doc = mupdf.PDFDocument.openDocument(buffer, 'application/pdf') as mupdf.PDFDocument;
  return { doc, pageCount: doc.countPages() };
}

export function readExistingAnnotations(
  doc: mupdf.PDFDocument,
  pageNums: number[],
): Record<number, string[]> {
  const out: Record<number, string[]> = {};
  for (const pageNum of pageNums) {
    const page = doc.loadPage(pageNum) as mupdf.PDFPage;
    const annots = page.getAnnotations();
    const contents: string[] = [];
    for (const annot of annots) {
      const c = annot.getContents();
      if (c) contents.push(c);
    }
    if (contents.length) out[pageNum] = contents;
  }
  return out;
}

export function extractBatchPdf(
  doc: mupdf.PDFDocument,
  pageNums: number[],
): Uint8Array {
  const sub = new mupdf.PDFDocument();
  for (const pageNum of pageNums) {
    sub.graftPage(-1, doc, pageNum);
  }
  const buffer = sub.saveToBuffer('');
  return buffer.asUint8Array();
}

export function annotateError(
  doc: mupdf.PDFDocument,
  err: ProofError,
): 'exact' | 'partial' | 'unmatched' {
  const pageIdx = err.page - 1;
  if (pageIdx < 0 || pageIdx >= doc.countPages()) return 'unmatched';
  const page = doc.loadPage(pageIdx) as mupdf.PDFPage;
  const comment = `טעות: ${err.error}\nתיקון: ${err.fix}`;

  const exact = page.search(err.text);
  if (exact && exact.length > 0) {
    addHighlight(page, flatten(exact), comment, [1, 1, 0]);
    return 'exact';
  }

  for (const word of err.text.split(/\s+/)) {
    if (word.length <= 2) continue;
    const hit = page.search(word);
    if (hit && hit.length > 0) {
      addHighlight(page, flatten(hit), `[חיפוש: ${err.text}]\n${comment}`, [1, 0.7, 0]);
      return 'partial';
    }
  }
  return 'unmatched';
}

function flatten(quads: mupdf.Quad[][]): mupdf.Quad[] {
  return quads.flat();
}

function addHighlight(
  page: mupdf.PDFPage,
  quads: mupdf.Quad[],
  contents: string,
  rgb: [number, number, number],
): void {
  const annot = page.createAnnotation('Highlight');
  annot.setQuadPoints(quads);
  annot.setContents(contents);
  annot.setColor(rgb);
  annot.setAuthor('סקירת עריכה');
  annot.update();
}

export function saveAnnotated(doc: mupdf.PDFDocument): Uint8Array {
  const buffer = doc.saveToBuffer('incremental');
  return buffer.asUint8Array();
}
```

Note on mupdf API surface: the exact method names above (`loadPage`, `getAnnotations`, `getContents`, `graftPage`, `saveToBuffer`, `search`, `createAnnotation`, `setQuadPoints`) are from `mupdf` 1.x's TypeScript types. If a method is named differently in the installed version, fix it here and continue — the responsibilities are correct.

- [ ] **Step 2: Type-check**

```bash
cd app && npx tsc --noEmit
```

Expected: clean. If a mupdf method name does not match the installed version, adjust until tsc is clean.

- [ ] **Step 3: Commit**

```bash
git add app/src/pdf/mupdf.ts
git commit -m "Add mupdf wrapper for slice/search/annotate/save"
```

---

### Task 7: AI analyze module

**Files:**
- Create: `app/src/ai/analyze.ts`

- [ ] **Step 1: Implement** `app/src/ai/analyze.ts`

```ts
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { ProofError } from '../pdf/mupdf';

export interface RawError {
  page: number;
  text: string;
  error: string;
  fix: string;
}

export async function analyzePages(args: {
  model: LanguageModel;
  pdfBytes: Uint8Array;
  pageNums: number[];
  prompt: string;
  abortSignal?: AbortSignal;
}): Promise<Omit<ProofError, 'match'>[]> {
  const { model, pdfBytes, pageNums, prompt, abortSignal } = args;

  const result = await generateText({
    model,
    abortSignal,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'file', data: pdfBytes, mediaType: 'application/pdf' },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const text = result.text.trim();
  if (!text || text === '[]' || text === 'אין') return [];

  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let parsed: RawError[];
  try {
    parsed = JSON.parse(match[0]) as RawError[];
  } catch {
    return [];
  }

  // Map local 1-indexed page numbers back to original PDF page numbers (1-indexed).
  const out: Omit<ProofError, 'match'>[] = [];
  for (const e of parsed) {
    const local = typeof e.page === 'number' ? e.page : 1;
    const idx = local >= 1 && local <= pageNums.length ? local - 1 : 0;
    out.push({
      page: pageNums[idx] + 1,
      text: e.text ?? '',
      error: e.error ?? '',
      fix: e.fix ?? '',
    });
  }
  return out;
}
```

- [ ] **Step 2: Type-check**

```bash
cd app && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/src/ai/analyze.ts
git commit -m "Add analyzePages: send batch PDF to LLM and parse findings"
```

---

### Task 8: Orchestrator

**Files:**
- Create: `app/src/runner/orchestrator.ts`

- [ ] **Step 1: Implement** `app/src/runner/orchestrator.ts`

```ts
import { createModel } from '../ai/providers';
import { analyzePages } from '../ai/analyze';
import { generateBatches } from '../pdf/batches';
import {
  annotateError,
  extractBatchPdf,
  openPdf,
  readExistingAnnotations,
  saveAnnotated,
} from '../pdf/mupdf';
import type { ProofError } from '../pdf/mupdf';
import { buildPrompt } from './prompt';
import type { Settings } from '../store/settings';

export type BatchStatus = 'queued' | 'running' | 'done' | 'error';

export interface BatchProgress {
  index: number;
  pageNums: number[];
  status: BatchStatus;
  errorsFound?: number;
  errorMessage?: string;
}

export interface RunResult {
  annotatedPdf: Blob;
  originalPdf: Blob;
  errors: ProofError[];
  batchesRun: number;
  pagesScanned: number;
}

export interface RunOptions {
  file: File;
  settings: Settings;
  onProgress: (p: BatchProgress) => void;
  abortSignal: AbortSignal;
}

export async function runProofread(opts: RunOptions): Promise<RunResult> {
  const { file, settings, onProgress, abortSignal } = opts;
  const fileBytes = await file.arrayBuffer();
  const { doc, pageCount } = await openPdf(fileBytes);

  const startIdx = Math.max(0, (settings.startPage ?? 1) - 1);
  const endIdx = Math.min(pageCount, settings.endPage ?? pageCount);

  const batches = generateBatches(startIdx, endIdx, settings.pagesPerBatch, settings.overlap);

  // Initial progress events so the UI can render the queue.
  batches.forEach((pageNums, index) =>
    onProgress({ index, pageNums, status: 'queued' }),
  );

  const model = createModel(settings);
  const limit = settings.concurrency > 0 ? settings.concurrency : batches.length;
  const sem = new Semaphore(limit);

  const allRaw: { batch: number; errs: Omit<ProofError, 'match'>[] }[] = [];

  await Promise.all(
    batches.map((pageNums, index) =>
      sem.run(async () => {
        if (abortSignal.aborted) return;
        onProgress({ index, pageNums, status: 'running' });
        try {
          const existing = readExistingAnnotations(doc, pageNums);
          const pdfBytes = extractBatchPdf(doc, pageNums);
          const prompt = buildPrompt(settings.prompt, pageNums, existing);
          const errs = await analyzePages({
            model,
            pdfBytes,
            pageNums,
            prompt,
            abortSignal,
          });
          allRaw.push({ batch: index, errs });
          onProgress({ index, pageNums, status: 'done', errorsFound: errs.length });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          onProgress({ index, pageNums, status: 'error', errorMessage: message });
        }
      }),
    ),
  );

  // Deduplicate by (page, text, error)
  const seen = new Set<string>();
  const finalErrors: ProofError[] = [];
  for (const { errs } of allRaw) {
    for (const e of errs) {
      const key = `${e.page}|${e.text}|${e.error}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const match = annotateError(doc, { ...e, match: 'unmatched' });
      finalErrors.push({ ...e, match });
    }
  }

  const annotatedBytes = saveAnnotated(doc);
  return {
    annotatedPdf: new Blob([annotatedBytes], { type: 'application/pdf' }),
    originalPdf: new Blob([fileBytes], { type: 'application/pdf' }),
    errors: finalErrors,
    batchesRun: batches.length,
    pagesScanned: endIdx - startIdx,
  };
}

class Semaphore {
  private active = 0;
  private waiters: (() => void)[] = [];
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      const next = this.waiters.shift();
      if (next) next();
    }
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd app && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/src/runner/orchestrator.ts
git commit -m "Add orchestrator: batch loop, semaphore, abort, dedup, annotate"
```

---

### Task 9: SettingsPanel component

**Files:**
- Create: `app/src/components/SettingsPanel.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useEffect, useState } from 'react';
import { isRouteModelValid } from '../ai/providers';
import { type Model, type Route, type Settings } from '../store/settings';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
}

const ROUTE_LABELS: Record<Route, string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  gateway: 'Vercel AI Gateway',
};

const ALL_MODELS: Model[] = ['claude-opus-4-7', 'gemini-3.1-pro'];

export function SettingsPanel({ settings, onChange }: Props) {
  const hasKey = !!settings.apiKeys[settings.route];
  const [open, setOpen] = useState(!hasKey);

  // Auto-correct invalid (route, model) pairs whenever the route changes.
  useEffect(() => {
    if (!isRouteModelValid(settings.route, settings.model)) {
      const fallback = ALL_MODELS.find((m) => isRouteModelValid(settings.route, m));
      if (fallback) onChange({ ...settings, model: fallback });
    }
  }, [settings.route]); // eslint-disable-line react-hooks/exhaustive-deps

  const availableModels = ALL_MODELS.filter((m) => isRouteModelValid(settings.route, m));

  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <button onClick={() => setOpen(!open)} style={{ width: '100%', textAlign: 'right' }}>
        ⚙ הגדרות {open ? '▾' : '▸'}
      </button>
      {open && (
        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          <div>
            <label>נתיב:</label>{' '}
            {(['anthropic', 'google', 'gateway'] as Route[]).map((r) => (
              <label key={r} style={{ marginInlineEnd: 12 }}>
                <input
                  type="radio"
                  checked={settings.route === r}
                  onChange={() => onChange({ ...settings, route: r })}
                />{' '}
                {ROUTE_LABELS[r]}
              </label>
            ))}
          </div>

          <div>
            <label>מודל: </label>
            <select
              value={settings.model}
              onChange={(e) => onChange({ ...settings, model: e.target.value as Model })}
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {(['anthropic', 'google', 'gateway'] as Route[]).map((r) => (
            <div key={r}>
              <label>API key ({ROUTE_LABELS[r]}): </label>
              <input
                type="password"
                value={settings.apiKeys[r]}
                onChange={(e) =>
                  onChange({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, [r]: e.target.value },
                  })
                }
                style={{ width: '60%' }}
              />
            </div>
          ))}

          <p style={{ fontSize: 12, color: '#666' }}>
            המפתחות נשמרים בדפדפן בלבד ונשלחים רק לספק שבחרת. אין שרת.
          </p>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Type-check** — `cd app && npx tsc --noEmit`. Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/SettingsPanel.tsx
git commit -m "Add SettingsPanel component"
```

---

### Task 10: FileDrop component

**Files:**
- Create: `app/src/components/FileDrop.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useRef, useState } from 'react';

interface Props {
  file: File | null;
  pageCount: number | null;
  onFile: (file: File) => void;
}

export function FileDrop({ file, pageCount, onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setHover(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type === 'application/pdf') onFile(f);
  };

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      style={{
        border: `2px dashed ${hover ? '#3a7' : '#aaa'}`,
        borderRadius: 8,
        padding: 24,
        textAlign: 'center',
        cursor: 'pointer',
        marginBottom: 12,
        background: hover ? '#f0fff4' : '#fff',
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
      />
      {file ? (
        <div>
          <strong>{file.name}</strong>
          {pageCount !== null && <span> · {pageCount} עמודים</span>}
        </div>
      ) : (
        <div>גרור PDF לכאן או לחץ לבחירה</div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/FileDrop.tsx
git commit -m "Add FileDrop component"
```

---

### Task 11: Parameters component

**Files:**
- Create: `app/src/components/Parameters.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { Settings } from '../store/settings';

interface Props {
  settings: Settings;
  pageCount: number | null;
  onChange: (s: Settings) => void;
}

export function Parameters({ settings, pageCount, onChange }: Props) {
  const max = pageCount ?? undefined;
  const start = settings.startPage ?? 1;
  const end = settings.endPage ?? pageCount ?? 1;
  const overlapInvalid = settings.overlap >= settings.pagesPerBatch;
  const rangeInvalid = pageCount !== null && (start < 1 || end > pageCount || start > end);

  return (
    <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
      <Field label="עמוד התחלה">
        <input
          type="number"
          min={1}
          max={max}
          value={start}
          onChange={(e) => onChange({ ...settings, startPage: Number(e.target.value) || 1 })}
        />
      </Field>
      <Field label="עמוד סיום">
        <input
          type="number"
          min={1}
          max={max}
          value={end}
          onChange={(e) => onChange({ ...settings, endPage: Number(e.target.value) || 1 })}
        />
      </Field>
      <Field label="עמודים לקבוצה">
        <input
          type="number"
          min={1}
          max={30}
          value={settings.pagesPerBatch}
          onChange={(e) => onChange({ ...settings, pagesPerBatch: Number(e.target.value) || 1 })}
        />
      </Field>
      <Field label="חפיפה">
        <input
          type="number"
          min={0}
          max={settings.pagesPerBatch - 1}
          value={settings.overlap}
          onChange={(e) => onChange({ ...settings, overlap: Number(e.target.value) || 0 })}
        />
      </Field>
      <Field label="מקביליות (0 = ללא הגבלה)">
        <input
          type="number"
          min={0}
          value={settings.concurrency}
          onChange={(e) => onChange({ ...settings, concurrency: Number(e.target.value) || 0 })}
        />
      </Field>
      {(overlapInvalid || rangeInvalid) && (
        <div style={{ color: 'crimson', flexBasis: '100%' }}>
          {overlapInvalid && <div>חפיפה חייבת להיות קטנה ממספר העמודים לקבוצה.</div>}
          {rangeInvalid && <div>טווח עמודים לא תקין.</div>}
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', minWidth: 120 }}>
      <span style={{ fontSize: 12, color: '#555' }}>{label}</span>
      {children}
    </label>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/Parameters.tsx
git commit -m "Add Parameters component"
```

---

### Task 12: PromptEditor component

**Files:**
- Create: `app/src/components/PromptEditor.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState } from 'react';
import { DEFAULT_PROMPT } from '../runner/prompt';

interface Props {
  prompt: string;
  onChange: (p: string) => void;
}

export function PromptEditor({ prompt, onChange }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={() => setOpen(!open)}>
          פרומפט {open ? '▾' : '▸'}
        </button>
        {open && (
          <button onClick={() => onChange(DEFAULT_PROMPT)}>איפוס לברירת מחדל</button>
        )}
      </div>
      {open && (
        <textarea
          value={prompt}
          onChange={(e) => onChange(e.target.value)}
          rows={20}
          style={{ width: '100%', marginTop: 8, fontFamily: 'monospace', direction: 'rtl' }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/PromptEditor.tsx
git commit -m "Add PromptEditor component"
```

---

### Task 13: ProgressLog component

**Files:**
- Create: `app/src/components/ProgressLog.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { BatchProgress } from '../runner/orchestrator';

interface Props {
  batches: Map<number, BatchProgress>;
}

export function ProgressLog({ batches }: Props) {
  if (batches.size === 0) return null;
  const list = [...batches.values()].sort((a, b) => a.index - b.index);
  const done = list.filter((b) => b.status === 'done' || b.status === 'error').length;
  const totalErrors = list.reduce((sum, b) => sum + (b.errorsFound ?? 0), 0);

  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12, marginBottom: 12 }}>
      <div style={{ marginBottom: 8 }}>
        {done} / {list.length} קבוצות · {totalErrors} טעויות
      </div>
      <ul style={{ maxHeight: 200, overflowY: 'auto', listStyle: 'none', padding: 0, margin: 0 }}>
        {list.map((b) => (
          <li key={b.index} style={{ fontFamily: 'monospace', fontSize: 13 }}>
            {renderRow(b)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function renderRow(b: BatchProgress): string {
  const range = b.pageNums.length === 1
    ? `עמוד ${b.pageNums[0] + 1}`
    : `עמודים ${b.pageNums[0] + 1}-${b.pageNums[b.pageNums.length - 1] + 1}`;
  switch (b.status) {
    case 'queued': return `• ${range} · ממתין`;
    case 'running': return `• ${range} · רץ…`;
    case 'done': return `✓ ${range} · ${b.errorsFound ?? 0} טעויות`;
    case 'error': return `✗ ${range} · ${b.errorMessage ?? 'שגיאה'}`;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/ProgressLog.tsx
git commit -m "Add ProgressLog component"
```

---

### Task 14: Results component

**Files:**
- Create: `app/src/components/Results.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { RunResult } from '../runner/orchestrator';

interface Props {
  result: RunResult | null;
  baseName: string;
}

export function Results({ result, baseName }: Props) {
  if (!result) return null;
  const anchored = result.errors.filter((e) => e.match !== 'unmatched').length;
  const unmatched = result.errors.length - anchored;

  const pdfUrl = URL.createObjectURL(result.annotatedPdf);
  const jsonBlob = new Blob([JSON.stringify(result.errors, null, 2)], { type: 'application/json' });
  const jsonUrl = URL.createObjectURL(jsonBlob);

  return (
    <section style={{ border: '1px solid #ccc', borderRadius: 8, padding: 12 }}>
      <div>
        סה"כ {result.errors.length} טעויות — {anchored} עוגנו, {unmatched} ללא עיגון
      </div>
      <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
        <a href={pdfUrl} download={`${baseName}_reviewed.pdf`}>
          <button>הורד PDF</button>
        </a>
        <a href={jsonUrl} download={`${baseName}_errors.json`}>
          <button>הורד JSON</button>
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/src/components/Results.tsx
git commit -m "Add Results component"
```

---

### Task 15: Wire up App.tsx

**Files:**
- Modify: `app/src/App.tsx`

- [ ] **Step 1: Replace** `app/src/App.tsx` with:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDrop } from './components/FileDrop';
import { Parameters } from './components/Parameters';
import { ProgressLog } from './components/ProgressLog';
import { PromptEditor } from './components/PromptEditor';
import { Results } from './components/Results';
import { SettingsPanel } from './components/SettingsPanel';
import { isRouteModelValid } from './ai/providers';
import { openPdf } from './pdf/mupdf';
import { runProofread } from './runner/orchestrator';
import type { BatchProgress, RunResult } from './runner/orchestrator';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from './store/settings';

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [batches, setBatches] = useState<Map<number, BatchProgress>>(new Map());
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => saveSettings(settings), [settings]);

  // Read page count when a new file is picked.
  useEffect(() => {
    setPageCount(null);
    setResult(null);
    if (!file) return;
    let cancelled = false;
    file.arrayBuffer().then((buf) => {
      openPdf(buf).then(({ pageCount }) => {
        if (!cancelled) {
          setPageCount(pageCount);
          setSettings((s) => ({ ...s, startPage: 1, endPage: pageCount }));
        }
      });
    });
    return () => { cancelled = true; };
  }, [file]);

  const baseName = useMemo(() => {
    if (!file) return 'document';
    return file.name.replace(/\.pdf$/i, '');
  }, [file]);

  const canRun =
    !!file &&
    !running &&
    isRouteModelValid(settings.route, settings.model) &&
    !!settings.apiKeys[settings.route] &&
    settings.overlap < settings.pagesPerBatch;

  const onRun = async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    setBatches(new Map());
    setRunning(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const r = await runProofread({
        file,
        settings,
        abortSignal: ac.signal,
        onProgress: (p) =>
          setBatches((prev) => {
            const next = new Map(prev);
            next.set(p.index, p);
            return next;
          }),
      });
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const onCancel = () => abortRef.current?.abort();

  const reset = () => {
    if (confirm('לאפס את כל ההגדרות?')) setSettings(DEFAULT_SETTINGS);
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: 24, direction: 'rtl' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>PDF Proofread</h1>
        <button onClick={reset} title="איפוס הגדרות">⟲</button>
      </header>

      <SettingsPanel settings={settings} onChange={setSettings} />
      <FileDrop file={file} pageCount={pageCount} onFile={setFile} />
      <Parameters settings={settings} pageCount={pageCount} onChange={setSettings} />
      <PromptEditor prompt={settings.prompt} onChange={(p) => setSettings({ ...settings, prompt: p })} />

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={onRun} disabled={!canRun}>הרץ</button>
        {running && <button onClick={onCancel}>ביטול</button>}
      </div>

      {error && <div style={{ color: 'crimson', marginBottom: 12 }}>שגיאה: {error}</div>}

      <ProgressLog batches={batches} />
      <Results result={result} baseName={baseName} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check + build**

```bash
cd app && npx tsc --noEmit && npm run build
```

Expected: clean type-check, successful build.

- [ ] **Step 3: Commit**

```bash
git add app/src/App.tsx
git commit -m "Wire up App.tsx with full Stage-1 flow"
```

---

### Task 16: End-to-end manual verification

This task is manual. The agent should report what they did and what they observed.

- [ ] **Step 1: Start dev server**

```bash
cd app && npm run dev
```

- [ ] **Step 2: Open the dev URL in a browser.** Expected: the app loads in RTL layout, settings panel auto-open with no API keys filled.

- [ ] **Step 3: Configure** route = Gateway, model = `gemini-3.1-pro`, paste a Gateway API key.

- [ ] **Step 4: Drop a small Hebrew PDF** (3–5 pages, ideally one with deliberate typos). Confirm filename and page count appear.

- [ ] **Step 5: Set parameters** (e.g., pages-per-batch = 1, overlap = 0, concurrency = 4) and click Run.

- [ ] **Step 6: Observe the progress log** — batches transition queued → running → done, with non-zero error counts on at least one batch.

- [ ] **Step 7: Click Download PDF** and open it. Expected: yellow highlights on found errors with hover-comments containing "טעות:" / "תיקון:".

- [ ] **Step 8: Click Download JSON** and inspect it. Expected: each row includes `match: 'exact' | 'partial' | 'unmatched'`.

- [ ] **Step 9: Run again on the same PDF** to confirm the "existing comments" injection works (the model should not repeat the same findings — at least the prompt's "אל תחזור עליהן" block is present in batch requests; verify by adding a temporary `console.log(prompt)` in the orchestrator if needed, then revert).

- [ ] **Step 10: Switch route** to Anthropic, paste an Anthropic key, run on the same PDF, verify it works.

- [ ] **Step 11: Final commit** if any test-driven adjustments were needed during manual verification:

```bash
git add -A
git commit -m "Final adjustments after manual verification"
```

---

### Task 17: GitHub Pages deploy workflow

Mirrors autoOffice's setup: a single workflow that builds with `VITE_BASE` set to the repo subpath and publishes `dist/` to GitHub Pages.

**Files:**
- Create: `.github/workflows/deploy.yml` (at repo root, NOT inside `app/`)

- [ ] **Step 1: Create the workflow** at `/root/pdf_proofread/.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main, master]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: app
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: app/package-lock.json

      - run: npm ci

      - run: npm run build
        env:
          VITE_BASE: /pdf_proofread/

      - uses: actions/upload-pages-artifact@v3
        with:
          path: app/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

- [ ] **Step 2: Verify the build still works locally with the subpath**

```bash
cd app && VITE_BASE=/pdf_proofread/ npm run build
```

Expected: clean build under `app/dist/`. Spot-check `app/dist/index.html` — assets should reference `/pdf_proofread/...` paths.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "Add GitHub Pages deploy workflow"
```

- [ ] **Step 4: One-time GitHub Pages setup** (manual, by the user)

After pushing to GitHub:
1. In the GitHub repo settings → Pages, set Source to "GitHub Actions".
2. The workflow will run on the next push to `main`/`master` and publish to `https://<user>.github.io/pdf_proofread/`.
3. If the repository is named differently, update `VITE_BASE` in `deploy.yml` accordingly (must match the repo subpath, with leading and trailing slash).

---

## Self-review checklist (run before handoff)

- [ ] Spec §2 (stack) covered by Task 1.
- [ ] Spec §3 (model resolution) covered by Task 5.
- [ ] Spec §4 (Settings shape) covered by Tasks 2 + 5.
- [ ] Spec §5 (editable prompt + placeholders) covered by Task 3.
- [ ] Spec §6 (per-batch flow) covered by Tasks 4, 6, 7, 8.
- [ ] Spec §7 (data shapes) covered by Tasks 6, 8.
- [ ] Spec §8 (UI layout) covered by Tasks 9–15.
- [ ] Spec §10 (CORS notes) implemented in Task 5's `createModel`.
- [ ] Spec §11 (file layout) matches the paths used across tasks.
- [ ] Spec §12 (GH Pages deployment) covered by Task 17.
- [ ] No TBDs, no "implement later", every step has either code or an exact command.
