# PDF Proofread — Client-Side App Design

**Status:** Approved (brainstorming complete, awaiting implementation plan)
**Date:** 2026-04-28
**Source script:** `script.py` (CLI version using PyMuPDF + Vercel AI Gateway → Gemini)

## 1. Goal

Turn `script.py` into a static, browser-based app that proofreads a Hebrew PDF for technical editing errors and writes the model's findings back into the PDF as annotations. Same model, prompt, and annotation behavior as the script — just driven from a UI, with multi-provider routing and an editable prompt.

The work ships in two stages:

- **Stage 1 (this design):** UI to configure a run, execute it in the browser, and download the annotated PDF + a JSON of the findings.
- **Stage 2 (planned, not built yet):** in-app PDF viewer with a comments sidebar, including comments that could not be anchored to a text location.

This document specifies Stage 1 and locks the data shapes Stage 2 will rely on.

## 2. Stack

- **Static SPA:** Vite + React + TypeScript. No backend.
- **PDF engine:** [`mupdf.js`](https://www.npmjs.com/package/mupdf) (WASM port of the same MuPDF library PyMuPDF wraps). Used for: opening the document, slicing per-batch sub-PDFs, `page.search()` text lookup, adding highlight annotations, and rendering pages to canvas (Stage 2).
- **LLM client:** Vercel AI SDK with three sub-packages:
  - `@ai-sdk/anthropic` — direct Anthropic route.
  - `@ai-sdk/google` — direct Google route.
  - `@ai-sdk/openai` — used for the Vercel AI Gateway route (`baseURL: https://ai-gateway.vercel.sh/v1`).
- **Persistence:** `localStorage`. No remote storage. No telemetry.

## 3. Provider routes and models

Two models are supported. The string passed to the SDK is route-dependent: direct routes use a bare ID, the Gateway route uses a provider-prefixed ID.

| Model in UI      | Anthropic route   | Google route             | Gateway route                       |
|------------------|-------------------|--------------------------|-------------------------------------|
| Claude Opus 4.7  | `claude-opus-4-7` | —                        | `anthropic/claude-opus-4-7`         |
| Gemini 3.1 Pro   | —                 | `gemini-3.1-pro-preview` | `google/gemini-3.1-pro-preview`     |

Resolution lives in `ai/providers.ts` as a single `resolveModelId(route, model)` function. The model dropdown filters to the selected route's supported models. Each route has its own API key slot in settings; only the selected route's key is required to run.

## 4. Settings

```ts
interface Settings {
  route: 'anthropic' | 'google' | 'gateway';
  model: 'claude-opus-4-7' | 'gemini-3.1-pro';   // logical name; resolveModelId() maps to per-route ID
  apiKeys: {
    anthropic: string;
    google: string;
    gateway: string;
  };
  pagesPerBatch: number;   // 1..30, default 1
  overlap: number;         // 0..(pagesPerBatch-1), default 0
  concurrency: number;     // 0 = unlimited, default 4 (browser-friendly; script default is 0)
  prompt: string;          // editable; default = the Hebrew template lifted from script.py
  startPage?: number;      // 1-indexed
  endPage?: number;        // 1-indexed, inclusive
}
```

Settings persist to `localStorage` under `pdf_proofread_settings`. API keys live in the same blob — they never leave the browser except in outbound calls to the chosen provider.

## 5. Editable prompt

The prompt textarea contains the full Hebrew template from `script.py` lines 99–126, with two placeholders the runtime substitutes per batch:

- `{page_context}` — `"עמוד N"` for single-page batches, `"עמודים N-M"` otherwise.
- `{existing_comments}` — the "אל תחזור עליהן" block injected only when the batch's pages already carry annotations; empty string otherwise.

A "Reset" button restores the default template verbatim. If the user removes a placeholder, the runtime simply does not inject that block (no error).

## 6. Per-batch execution flow

Mirrors `script.py` 1:1, with the engine swapped for `mupdf.js` and the LLM call swapped for the AI SDK.

1. **Slice** the batch's pages into a sub-PDF (open an empty `PDFDocument` and graft the source pages into it; serialize to bytes). This matches the script's `new_doc.insert_pdf` step.
2. **Read existing annotations** on those pages and format them into the `{existing_comments}` block.
3. **Compose the prompt** by substituting `{page_context}` and `{existing_comments}` into the user-edited template.
4. **Call the model** via `generateText({ model, messages: [{ role: 'user', content: [{ type: 'file', data: pdfBytes, mediaType: 'application/pdf' }, { type: 'text', text: prompt }] }] })`. `model` comes from `createModel(route, modelId, apiKey)`.
5. **Parse the JSON array** from the response (regex `\[.*\]`, same as the script). On parse failure, treat the batch as zero findings — no annotations added, no error thrown — and log it in the progress panel. Map local 1-indexed page numbers back to original PDF page numbers.
6. **Anchor each finding** in the original document via `page.search(error.text)`:
   - Hit → yellow highlight, `match: 'exact'`.
   - Miss → retry word-by-word with words longer than 2 chars; first hit becomes an orange highlight, `match: 'partial'`.
   - Total miss → no annotation; record `match: 'unmatched'` for Stage 2.
7. Set the annotation's `title` to `"סקירת עריכה"` and `content` to `"טעות: {error}\nתיקון: {fix}"`, matching the script.

Concurrency uses a small in-file semaphore (no extra dependency). Cancellation uses a single `AbortController`: cancelling aborts in-flight `generateText` calls and prevents queued batches from starting.

After all batches return, deduplicate by `(page, text, error)` and produce two blobs:

- `book_reviewed.pdf` — annotated copy.
- `book_errors.json` — full findings, including `match` status.

## 7. Data shapes

```ts
interface ProofError {
  page: number;            // 1-indexed, original PDF
  text: string;            // model's quoted text from the page
  error: string;           // model's short description
  fix: string;             // model's suggested correction
  match: 'exact' | 'partial' | 'unmatched';
}

interface RunResult {
  annotatedPdf: Blob;
  errors: ProofError[];
  pagesScanned: number;
  batchesRun: number;
}
```

Stage 2 reads `errors[]` directly: `match !== 'unmatched'` rows link to a page in the viewer; `match === 'unmatched'` rows show in a separate sidebar group.

## 8. UI layout (Stage 1)

Single page, RTL. Top to bottom:

1. **Header** — title.
2. **Settings panel** (collapsible; auto-open on first visit if no API key set):
   - Route radio group: Anthropic / Google / Gateway.
   - Model dropdown filtered by route.
   - Three API-key inputs (one per route), each masked.
   - One-line note: keys live in your browser only; they are sent only to the chosen provider; there is no backend.
3. **File drop zone** — drag-drop or click-to-pick. Once a file is selected, show filename and total page count.
4. **Parameters row** — start page, end page, pages-per-batch, overlap, parallelism. Inline validation: `overlap < pagesPerBatch`, `1 ≤ start ≤ end ≤ totalPages`.
5. **Prompt editor** (collapsible) — textarea + Reset button.
6. **Run / Cancel** — Run is disabled when there is no PDF, no key for the selected route, or invalid parameters. Cancel is shown only while a run is in progress.
7. **Progress log** — per-batch status lines (`pages X-Y · queued | running | ✓ N errors | ✗ error`) plus an aggregate counter (`done/total batches · errors found`). Flat list; scrollable.
8. **Results** — appears when a run finishes: summary (`N errors total — A anchored, U unmatched`) and two download buttons (PDF, JSON).

Not in Stage 1: the PDF viewer, the comments sidebar, run history.

## 9. Stage 2 hooks (planned)

To avoid Stage-1 rework when Stage 2 lands:

- `RunResult` keeps both the annotated and original PDF blobs in memory after a run.
- `ProofError.match` is already populated.
- `mupdf.js`'s `Page.toPixmap()` → canvas is the renderer; no extra viewer dependency required.

Stage 2 layout target:

```
┌─────────────────┬─────────────────────────────┐
│  PDF viewer     │  Comments                   │
│  (mupdf canvas) │   ▸ Anchored (N)            │
│                 │     • p.4  טעות → תיקון     │
│                 │   ▸ Unmatched (M)           │
│                 │     • p.12 text didn't fit  │
└─────────────────┴─────────────────────────────┘
```

## 10. Browser / CORS notes

- Anthropic SDK requires explicit browser opt-in. Use `createAnthropic({ apiKey, headers: { 'anthropic-dangerous-direct-browser-access': 'true' } })`.
- Google SDK works in the browser without a flag.
- Vercel AI Gateway via `createOpenAI({ apiKey, baseURL: 'https://ai-gateway.vercel.sh/v1' })` works in the browser.
- All three routes accept native PDF input via the AI SDK's `file` content part with `mediaType: 'application/pdf'`. No rasterization fallback is needed because the model set is constrained to PDF-native models.

## 11. File layout

```
pdf_proofread/
├─ script.py                       # existing CLI; left in place for reference
├─ docs/superpowers/specs/...      # this doc
└─ app/                            # new app lives here
   ├─ index.html
   ├─ vite.config.ts
   ├─ tsconfig.json
   ├─ package.json
   └─ src/
      ├─ main.tsx
      ├─ App.tsx
      ├─ components/
      │  ├─ SettingsPanel.tsx
      │  ├─ FileDrop.tsx
      │  ├─ Parameters.tsx
      │  ├─ PromptEditor.tsx
      │  ├─ ProgressLog.tsx
      │  └─ Results.tsx
      ├─ store/
      │  └─ settings.ts            # load/save Settings, defaults
      ├─ pdf/
      │  ├─ mupdf.ts               # open, slice batch, search, annotate, save
      │  └─ batches.ts             # generateBatches() — port of script.py
      ├─ ai/
      │  ├─ providers.ts           # createModel(route, model, apiKey)
      │  └─ analyze.ts             # analyzePages(pdfBytes, pageNums, prompt, existing)
      └─ runner/
         ├─ orchestrator.ts        # batch loop, semaphore, AbortController
         └─ prompt.ts              # default Hebrew template + placeholder substitution
```

## 12. Deployment

The app is a fully static SPA, deployed to GitHub Pages via a workflow that mirrors `autoOffice`:

- `vite.config.ts` reads `base` from `process.env.VITE_BASE` so it can be set to the repo subpath at build time.
- `.github/workflows/deploy.yml` runs on push to `main`/`master`: `npm ci` → `npm run build` (with `VITE_BASE=/pdf_proofread/`) → `actions/upload-pages-artifact@v3` → `actions/deploy-pages@v4`.
- One-time manual step by the repo owner: in GitHub repo settings → Pages, set Source to "GitHub Actions".
- Result: app is served at `https://<user>.github.io/pdf_proofread/`. API keys still live exclusively in the visitor's browser; the static origin holds no secrets.

## 13. Out of scope

- The Stage-2 viewer and comments sidebar.
- Run history, multi-document queues, server-side execution.
- Image-rasterization fallback for non-PDF-native models.
- Authentication, billing, or any backend features.
