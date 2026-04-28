<p align="center">
  <img src="public/logo.png" alt="PDF Proofread logo" width="120" />
</p>

<h1 align="center">PDF Proofread</h1>

A static, browser-based app that proofreads Hebrew PDFs for technical editing
errors using an LLM (Claude Opus 4.7 or Gemini 3.1 Pro) and writes the model's
findings back into the PDF as comment annotations.

Live demo: <https://sivan22.github.io/pdf_proofread/>

## What it does

Drop a Hebrew PDF, pick a provider + model, paste an API key, and run. The app
splits the document into batches, sends each batch to the model with a
configurable Hebrew prompt asking for **technical** errors only (double words,
double punctuation, broken letter sequences, leftover editor question marks,
wrong references, layout issues, page-number gaps, header mistakes, etc.), and
adds a yellow highlight + sticky-note comment at each finding. Comments that
couldn't be anchored to a text location are kept in the JSON download so
nothing is lost.

Outputs:

- `<name>_reviewed.pdf` — the original PDF with comments added.
- `<name>_errors.json` — every finding the model returned, including
  `match: 'exact' | 'partial' | 'unmatched'`.

## Models and routes

| Model            | Direct provider     | Vercel AI Gateway              |
|------------------|---------------------|--------------------------------|
| Claude Opus 4.7  | Anthropic API       | `anthropic/claude-opus-4-7`    |
| Gemini 3.1 Pro   | Google API          | `google/gemini-3.1-pro-preview`|

Both models are run with **high reasoning effort**:

- Anthropic: `thinking: { type: 'adaptive' }, effort: 'high'`
- Google: `thinkingConfig: { thinkingLevel: 'high' }`

API keys are stored in your browser's `localStorage` only. There is no
backend; all calls go directly from the browser to the chosen provider.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed URL.

## Build

```bash
npm run build
```

Outputs to `dist/`.

## Test

```bash
npm test
```

Runs the unit tests covering settings persistence, prompt placeholder
substitution, batch generation, and provider/model resolution.

## Deploy to GitHub Pages

The workflow at `.github/workflows/deploy.yml` builds with
`VITE_BASE=/pdf_proofread/` and publishes `dist/` on every push to
`main`/`master`. To enable deployment:

1. In your GitHub repo settings → Pages, set Source to **GitHub Actions**.
2. Push to `main`. The site appears at
   `https://<your-username>.github.io/pdf_proofread/`.
3. If you fork under a different repo name, change `VITE_BASE` in
   `deploy.yml` to match the repo subpath.

## Stack

- Vite + React 19 + TypeScript
- shadcn/ui (Tailwind v4 + Radix primitives)
- [`mupdf`](https://www.npmjs.com/package/mupdf) (WASM) for PDF read / search /
  annotate / save
- Vercel AI SDK v6: `@ai-sdk/anthropic`, `@ai-sdk/google`, plus the
  `createGateway` provider from `ai` for the Gateway route
- `vitest` for the pure-logic tests

## License

MIT.
