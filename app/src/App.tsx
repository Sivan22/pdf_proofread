import { useEffect, useMemo, useRef, useState } from 'react';
import { FileDrop } from './components/FileDrop';
import { Parameters } from './components/Parameters';
import { ProgressLog } from './components/ProgressLog';
import { PromptEditor } from './components/PromptEditor';
import { Results } from './components/Results';
import { SettingsPanel } from './components/SettingsPanel';
import { Alert, AlertDescription } from './components/ui/alert';
import { Button } from './components/ui/button';
import { isRouteModelValid } from './ai/providers';
import { openPdf } from './pdf/mupdf';
import { runProofread } from './runner/orchestrator';
import type { BatchProgress, RunResult } from './runner/orchestrator';
import { DEFAULT_PROMPT } from './runner/prompt';
import { loadSettings, saveSettings, type Settings } from './store/settings';

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

  // Populate prompt with DEFAULT_PROMPT on first load if empty.
  useEffect(() => {
    if (!settings.prompt) {
      setSettings((s) => ({ ...s, prompt: DEFAULT_PROMPT }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div dir="rtl" className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">PDF Proofread</h1>
      </header>

      <div className="space-y-4">
        <SettingsPanel settings={settings} onChange={setSettings} />
        <FileDrop file={file} pageCount={pageCount} onFile={setFile} />
        <Parameters settings={settings} pageCount={pageCount} onChange={setSettings} />
        <PromptEditor prompt={settings.prompt} onChange={(p) => setSettings({ ...settings, prompt: p })} />

        <div className="flex gap-2">
          <Button onClick={onRun} disabled={!canRun}>הרץ</Button>
          {running && (
            <Button variant="outline" onClick={onCancel}>ביטול</Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>שגיאה: {error}</AlertDescription>
          </Alert>
        )}

        <ProgressLog batches={batches} />
        <Results result={result} baseName={baseName} />
      </div>
    </div>
  );
}
