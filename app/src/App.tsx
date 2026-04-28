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
import { DEFAULT_PROMPT } from './runner/prompt';
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
