import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, Heart, ListChecks } from 'lucide-react';
import * as mupdf from 'mupdf';
import { FileDrop } from './components/FileDrop';
import { MugahPromo } from './components/MugahPromo';
import { Parameters } from './components/Parameters';
import { ProgressLog } from './components/ProgressLog';
import { PromptEditor } from './components/PromptEditor';
import { Results } from './components/Results';
import { ReviewTab } from './components/ReviewTab';
import { SettingsPanel } from './components/SettingsPanel';
import { Alert, AlertDescription } from './components/ui/alert';
import { Button } from './components/ui/button';
import { Card } from './components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { isRouteModelValid } from './ai/providers';
import {
  HIGHLIGHT_EXACT,
  addHighlight,
  buildAnnotationComment,
  openPdf,
  rectsToQuads,
  removeAnnotation,
  saveAnnotated,
  updateAnnotationContents,
} from './pdf/mupdf';
import type { Rect } from './pdf/mupdf';
import { startProofread } from './runner/orchestrator';
import type { BatchProgress, ProofErrorRow } from './runner/orchestrator';
import { DEFAULT_PROMPT } from './runner/prompt';
import { loadSettings, saveSettings, type Settings } from './store/settings';

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [batches, setBatches] = useState<Map<number, BatchProgress>>(new Map());
  const [rows, setRows] = useState<ProofErrorRow[]>([]);
  const [activeTab, setActiveTab] = useState<'setup' | 'review'>('setup');
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const docRef = useRef<mupdf.PDFDocument | null>(null);

  useEffect(() => saveSettings(settings), [settings]);

  useEffect(() => {
    if (!settings.prompt) {
      setSettings((s) => ({ ...s, prompt: DEFAULT_PROMPT }));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Picking a (new) file clears any prior run state. The Review tab uses the
  // file directly (File extends Blob) so the user can browse the PDF before
  // running any analysis.
  useEffect(() => {
    setPageCount(null);
    setRows([]);
    setBatches(new Map());
    docRef.current = null;
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
    setRows([]);
    setBatches(new Map());
    setActiveTab('review');
    setRunning(true);
    docRef.current = null;
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const handle = await startProofread({
        file,
        settings,
        abortSignal: ac.signal,
        onProgress: (p) =>
          setBatches((prev) => {
            const next = new Map(prev);
            next.set(p.index, p);
            return next;
          }),
        onErrors: (newRows) =>
          setRows((prev) => [...prev, ...newRows]),
      });
      docRef.current = handle.doc;
      await handle.done;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const onCancel = () => abortRef.current?.abort();

  const onSaveRow = (id: string, patch: { text: string; error: string; fix: string }) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, ...patch };
        if (r.annot) {
          const comment = buildAnnotationComment(
            patch.error,
            patch.fix,
            r.match === 'exact' ? undefined : patch.text,
          );
          updateAnnotationContents(r.annot, comment);
        }
        return updated;
      }),
    );
  };

  const onDeleteRow = (id: string) => {
    setRows((prev) => {
      const target = prev.find((r) => r.id === id);
      if (target?.annot && docRef.current) {
        removeAnnotation(docRef.current, target.page, target.annot);
      }
      return prev.filter((r) => r.id !== id);
    });
  };

  const onReanchorRow = (id: string, rects: Rect[]) => {
    if (!docRef.current) return;
    const doc = docRef.current;
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (r.annot) removeAnnotation(doc, r.page, r.annot);
        const comment = buildAnnotationComment(r.error, r.fix);
        const annot = addHighlight(doc, {
          page: r.page,
          quads: rectsToQuads(rects),
          contents: comment,
          color: HIGHLIGHT_EXACT,
        });
        return { ...r, rects, match: 'exact', annot };
      }),
    );
  };

  const getAnnotatedPdf = (): Blob | null => {
    if (!docRef.current) return null;
    const bytes = saveAnnotated(docRef.current);
    return new Blob([bytes as BlobPart], { type: 'application/pdf' });
  };

  return (
    <div dir="rtl" className="mx-auto max-w-7xl px-6 py-6">
      <header className="mb-4 flex items-center gap-3">
        <img src="logo.png" alt="" className="size-10" />
        <h1 className="me-auto text-2xl font-semibold tracking-tight">PDF Proofread</h1>
        <MugahPromo />
      </header>

      <Tabs
        dir="rtl"
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'setup' | 'review')}
      >
        <TabsList>
          <TabsTrigger value="setup">הגדרות</TabsTrigger>
          <TabsTrigger value="review" disabled={!file}>
            סקירה {rows.length > 0 && `(${rows.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <div className="mx-auto max-w-3xl space-y-4">
            <SettingsPanel settings={settings} onChange={setSettings} />
            <FileDrop file={file} pageCount={pageCount} onFile={setFile} />
            <Parameters settings={settings} pageCount={pageCount} onChange={setSettings} />
            <PromptEditor
              prompt={settings.prompt}
              onChange={(p) => setSettings({ ...settings, prompt: p })}
            />

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

            <CollapsibleLogs batches={batches} />
            <Results rows={rows} baseName={baseName} getAnnotatedPdf={getAnnotatedPdf} />
          </div>
        </TabsContent>

        <TabsContent value="review">
          <ReviewTab
            pdfBlob={file}
            rows={rows}
            batches={batches}
            baseName={baseName}
            getAnnotatedPdf={getAnnotatedPdf}
            onSaveRow={onSaveRow}
            onDeleteRow={onDeleteRow}
            onReanchorRow={onReanchorRow}
          />
        </TabsContent>
      </Tabs>

      <footer className="mt-10 flex flex-col items-center justify-center gap-2 border-t pt-6 text-sm text-muted-foreground">
        <a
          href="https://github.com/Sivan22/pdf_proofread"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub repository"
          className="inline-flex items-center gap-2 hover:text-foreground"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-5"
            fill="currentColor"
          >
            <path d="M12 .5C5.73.5.67 5.56.67 11.83c0 5.01 3.24 9.26 7.74 10.76.57.1.78-.25.78-.55 0-.27-.01-.99-.02-1.94-3.15.68-3.81-1.52-3.81-1.52-.51-1.31-1.26-1.66-1.26-1.66-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.74 2.66 1.24 3.31.95.1-.74.4-1.24.72-1.53-2.51-.29-5.16-1.26-5.16-5.59 0-1.24.44-2.25 1.16-3.04-.12-.29-.5-1.45.11-3.02 0 0 .94-.3 3.09 1.16.9-.25 1.86-.38 2.82-.39.96.01 1.92.14 2.82.39 2.15-1.46 3.09-1.16 3.09-1.16.61 1.57.23 2.73.11 3.02.72.79 1.16 1.8 1.16 3.04 0 4.34-2.66 5.3-5.19 5.58.41.36.77 1.06.77 2.13 0 1.54-.01 2.78-.01 3.16 0 .31.21.66.79.55 4.49-1.5 7.73-5.75 7.73-10.76C23.33 5.56 18.27.5 12 .5z" />
          </svg>
        </a>
        <div className="inline-flex items-center gap-1" dir="ltr">
          <span>Made with</span>
          <Heart className="size-4 fill-red-500 text-red-500" />
          <span>by Sivan Ratson</span>
        </div>
      </footer>
    </div>
  );
}

function CollapsibleLogs({ batches }: { batches: Map<number, BatchProgress> }) {
  const [open, setOpen] = useState(false);
  if (batches.size === 0) return null;
  const list = [...batches.values()];
  const done = list.filter((b) => b.status === 'done' || b.status === 'error').length;
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 rounded-xl px-6 py-3 text-start text-sm font-medium hover:bg-accent/40"
      >
        <span className="flex items-center gap-2">
          <ListChecks className="size-4" />
          יומן הרצה ({done} / {list.length})
        </span>
        {open ? <ChevronDown className="size-4" /> : <ChevronLeft className="size-4" />}
      </button>
      {open && (
        <div className="px-2 pb-3">
          <ProgressLog batches={batches} />
        </div>
      )}
    </Card>
  );
}
