import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { PdfViewer, type PdfPageMeta, type PdfViewerHandle } from './PdfViewer';
import { FixCard } from './FixCard';
import type { BatchProgress, ProofErrorRow } from '../runner/orchestrator';
import type { Rect } from '../pdf/mupdf';

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const DEFAULT_SCALE = 1.4;

interface Props {
  pdfBlob: Blob | null;
  rows: ProofErrorRow[];
  batches: Map<number, BatchProgress>;
  baseName: string;
  /** Returns the bytes for the latest annotated PDF (built fresh from the current state). */
  getAnnotatedPdf: () => Blob | null;
  onSaveRow: (id: string, patch: { text: string; error: string; fix: string }) => void;
  onDeleteRow: (id: string) => void;
  onReanchorRow: (id: string, rects: Rect[]) => void;
}

interface DrawState {
  pageNum: number;
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

export function ReviewTab({
  pdfBlob,
  rows,
  batches,
  baseName,
  getAnnotatedPdf,
  onSaveRow,
  onDeleteRow,
  onReanchorRow,
}: Props) {
  const viewerRef = useRef<PdfViewerHandle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reanchorId, setReanchorId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const drawState = useRef<DrawState | null>(null);
  const [, forceTick] = useState(0);
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  // Latest page intrinsic width in PDF points — captured on each overlay
  // render so "fit width" can compute the right zoom.
  const latestPdfWidth = useRef<number>(0);
  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const zoomIn = () =>
    setScale((s) => Math.min(MAX_SCALE, Math.round((s + 0.2) * 100) / 100));
  const zoomOut = () =>
    setScale((s) => Math.max(MIN_SCALE, Math.round((s - 0.2) * 100) / 100));
  const zoomReset = () => setScale(DEFAULT_SCALE);
  const fitWidth = () => {
    const w = viewerRef.current?.getContainerWidth() ?? 0;
    const pdfW = latestPdfWidth.current;
    if (w <= 0 || pdfW <= 0) return;
    // Subtract a little so the scrollbar/margins don't force horizontal scroll.
    const target = (w - 24) / pdfW;
    setScale(Math.max(MIN_SCALE, Math.min(MAX_SCALE, target)));
  };
  const goToPage = (n: number) => {
    const clamped = Math.max(1, Math.min(pageCount || 1, Math.floor(n)));
    viewerRef.current?.scrollToPage(clamped);
  };

  // Per-page CSS-pixels-per-PDF-point scale cache so DOM selection rects can
  // be converted to PDF points. Updated each time `renderOverlay` runs.
  const pageScales = useRef<Map<number, number>>(new Map());

  const rowsByPage = useMemo(() => {
    const m = new Map<number, ProofErrorRow[]>();
    for (const row of rows) {
      const arr = m.get(row.page) ?? [];
      arr.push(row);
      m.set(row.page, arr);
    }
    return m;
  }, [rows]);

  const scrollToRow = (row: ProofErrorRow) => {
    // Take the bounding rect over all the row's quads so a multi-line match
    // still gets a single sensible scroll target.
    if (row.rects.length > 0) {
      const x0 = Math.min(...row.rects.map((r) => r.x0));
      const x1 = Math.max(...row.rects.map((r) => r.x1));
      const y0 = Math.min(...row.rects.map((r) => r.y0));
      const y1 = Math.max(...row.rects.map((r) => r.y1));
      viewerRef.current?.scrollToRect(row.page, { x0, y0, x1, y1 });
    } else {
      viewerRef.current?.scrollToPage(row.page);
    }
  };

  useEffect(() => {
    if (!selectedId) return;
    const row = rows.find((r) => r.id === selectedId);
    if (row) scrollToRow(row);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartReanchor = (id: string) => {
    setReanchorId(id);
    setSelectedId(id);
    setDrawMode(false);
    const row = rows.find((r) => r.id === id);
    if (row) scrollToRow(row);
  };

  const handleCancelReanchor = () => {
    setReanchorId(null);
    setDrawMode(false);
  };

  // Listen for text selection while in re-anchor mode.
  useEffect(() => {
    if (!reanchorId || drawMode) return;
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const startEl = closestPageEl(range.startContainer);
      const endEl = closestPageEl(range.endContainer);
      if (!startEl || !endEl || startEl !== endEl) return;
      const pageNum = Number(startEl.getAttribute('data-page-num'));
      const cssScale = pageScales.current.get(pageNum);
      if (!cssScale) return;
      const pageRect = startEl.getBoundingClientRect();
      const clientRects = Array.from(range.getClientRects());
      if (clientRects.length === 0) return;
      const rects: Rect[] = clientRects
        .map((cr) =>
          cssRectToPdfRect(
            {
              left: cr.left - pageRect.left,
              top: cr.top - pageRect.top,
              width: cr.width,
              height: cr.height,
            },
            cssScale,
          ),
        )
        .filter((r): r is Rect => r !== null);
      if (rects.length === 0) return;
      const row = rows.find((r) => r.id === reanchorId);
      if (!row || row.page !== pageNum) return;
      sel.removeAllRanges();
      onReanchorRow(reanchorId, rects);
      setReanchorId(null);
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [reanchorId, drawMode, rows, onReanchorRow]);

  const renderOverlay = useCallback(
    (meta: PdfPageMeta) => {
      const cssScale = meta.height / meta.pdfHeight;
      pageScales.current.set(meta.pageNum, cssScale);
      latestPdfWidth.current = meta.pdfWidth;
      const pageRows = rowsByPage.get(meta.pageNum) ?? [];

      const highlightEls = pageRows.flatMap((row) =>
        row.rects.map((r, i) => {
          const css = pdfRectToCss(r, cssScale);
          if (!css) return null;
          const isSelected = row.id === selectedId;
          const isReanchor = row.id === reanchorId;
          const color =
            row.match === 'exact'
              ? 'rgba(255, 215, 0, 0.4)'
              : 'rgba(255, 165, 0, 0.4)';
          return (
            <div
              key={`${row.id}-${i}`}
              className="absolute pointer-events-auto cursor-pointer"
              style={{
                left: css.left,
                top: css.top,
                width: css.width,
                height: css.height,
                background: color,
                outline: isSelected
                  ? '2px solid rgb(59, 130, 246)'
                  : isReanchor
                  ? '2px solid rgb(245, 158, 11)'
                  : 'none',
              }}
              title={`${row.error} → ${row.fix}`}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(row.id);
              }}
            />
          );
        }),
      );

      const draw = drawState.current;
      const drawingRect =
        drawMode && reanchorId && draw && draw.pageNum === meta.pageNum
          ? {
              left: Math.min(draw.startX, draw.curX),
              top: Math.min(draw.startY, draw.curY),
              width: Math.abs(draw.curX - draw.startX),
              height: Math.abs(draw.curY - draw.startY),
            }
          : null;

      return (
        <>
          {highlightEls}
          {drawMode && reanchorId && (
            <div
              className="absolute inset-0 pointer-events-auto"
              style={{ cursor: 'crosshair' }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.setPointerCapture(e.pointerId);
                const rect = e.currentTarget.getBoundingClientRect();
                drawState.current = {
                  pageNum: meta.pageNum,
                  startX: e.clientX - rect.left,
                  startY: e.clientY - rect.top,
                  curX: e.clientX - rect.left,
                  curY: e.clientY - rect.top,
                };
                forceTick((t) => t + 1);
              }}
              onPointerMove={(e) => {
                const d = drawState.current;
                if (!d || d.pageNum !== meta.pageNum) return;
                const rect = e.currentTarget.getBoundingClientRect();
                d.curX = e.clientX - rect.left;
                d.curY = e.clientY - rect.top;
                forceTick((t) => t + 1);
              }}
              onPointerUp={() => {
                const d = drawState.current;
                if (!d || d.pageNum !== meta.pageNum) return;
                drawState.current = null;
                const cssRect = {
                  left: Math.min(d.startX, d.curX),
                  top: Math.min(d.startY, d.curY),
                  width: Math.abs(d.curX - d.startX),
                  height: Math.abs(d.curY - d.startY),
                };
                forceTick((t) => t + 1);
                if (cssRect.width < 4 || cssRect.height < 4) return;
                if (!reanchorId) return;
                const pdfRect = cssRectToPdfRect(cssRect, cssScale);
                if (!pdfRect) return;
                onReanchorRow(reanchorId, [pdfRect]);
                setReanchorId(null);
                setDrawMode(false);
              }}
            />
          )}
          {drawingRect && (
            <div
              className="absolute pointer-events-none border-2 border-amber-500 bg-amber-300/30"
              style={drawingRect}
            />
          )}
        </>
      );
    },
    [rowsByPage, selectedId, reanchorId, drawMode, onReanchorRow],
  );

  if (!pdfBlob) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
        אין מסמך לסקירה. חזור ללשונית ההגדרות והרץ ניתוח.
      </div>
    );
  }

  const progressDone = [...batches.values()].filter(
    (b) => b.status === 'done' || b.status === 'error',
  ).length;
  const progressErr = [...batches.values()].filter((b) => b.status === 'error').length;

  return (
    <div dir="rtl" className="grid h-[80vh] grid-cols-[360px_1fr] gap-3">
      <div className="flex h-full flex-col overflow-hidden rounded-md border">
        <div className="flex items-center justify-between border-b px-3 py-2 text-xs">
          <span className="font-medium text-sm">
            תיקונים ({rows.length})
          </span>
          {batches.size > 0 && (
            <span
              className={
                progressErr > 0
                  ? 'text-destructive'
                  : 'text-muted-foreground'
              }
            >
              {progressDone}/{batches.size} קבוצות
              {progressErr > 0 && ` · ${progressErr} שגיאות`}
            </span>
          )}
        </div>
        {rows.length > 0 && (
          <div className="flex gap-2 border-b px-3 py-2">
            <button
              type="button"
              onClick={() => {
                const blob = getAnnotatedPdf();
                if (blob) triggerDownload(blob, `${baseName}_reviewed.pdf`);
              }}
              className="rounded-md border bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              הורד PDF
            </button>
            <button
              type="button"
              onClick={() => {
                const errors = rows.map((r) => ({
                  page: r.page,
                  text: r.text,
                  error: r.error,
                  fix: r.fix,
                  match: r.match,
                }));
                const blob = new Blob([JSON.stringify(errors, null, 2)], {
                  type: 'application/json',
                });
                triggerDownload(blob, `${baseName}_errors.json`);
              }}
              className="rounded-md border bg-background px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              הורד JSON
            </button>
          </div>
        )}
        <div className="flex-1 space-y-2 overflow-y-auto p-2">
          {rows.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {batches.size === 0
                ? 'טרם בוצע ניתוח. עברו ללשונית ההגדרות והקליקו "הרץ" כדי להתחיל.'
                : 'התיקונים יופיעו כאן לפי סדר העמודים, ככל שקבוצות מסתיימות.'}
            </div>
          ) : (
            rows.map((row) => (
              <FixCard
                key={row.id}
                row={row}
                selected={selectedId === row.id}
                reanchoring={reanchorId === row.id}
                onSelect={setSelectedId}
                onSave={onSaveRow}
                onDelete={onDeleteRow}
                onStartReanchor={handleStartReanchor}
                onCancelReanchor={handleCancelReanchor}
              />
            ))
          )}
        </div>
      </div>

      <div className="relative h-full overflow-hidden rounded-md border">
        <PdfViewer
          ref={viewerRef}
          blob={pdfBlob}
          scale={scale}
          renderOverlay={renderOverlay}
          onPagesLoaded={setPageCount}
          onCurrentPageChange={setCurrentPage}
        />
        <div
          dir="ltr"
          className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background/95 px-2 py-1 text-xs shadow-md backdrop-blur"
        >
          <button
            type="button"
            title="עמוד קודם"
            disabled={currentPage <= 1}
            onClick={() => goToPage(currentPage - 1)}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="size-4" />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(pageInput);
              if (Number.isFinite(n)) goToPage(n);
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^0-9]/g, ''))}
              onBlur={() => setPageInput(String(currentPage))}
              className="w-10 rounded border bg-background px-1 py-0.5 text-center"
            />
            <span className="text-muted-foreground">/ {pageCount || '—'}</span>
          </form>
          <button
            type="button"
            title="עמוד הבא"
            disabled={pageCount > 0 && currentPage >= pageCount}
            onClick={() => goToPage(currentPage + 1)}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
          >
            <ChevronRight className="size-4" />
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            type="button"
            title="הקטן"
            onClick={zoomOut}
            disabled={scale <= MIN_SCALE}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            type="button"
            title="איפוס שינוי גודל"
            onClick={zoomReset}
            className="min-w-[3rem] rounded px-1 py-0.5 text-center font-mono hover:bg-muted"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            type="button"
            title="הגדל"
            onClick={zoomIn}
            disabled={scale >= MAX_SCALE}
            className="rounded p-1 hover:bg-muted disabled:opacity-40"
          >
            <ZoomIn className="size-4" />
          </button>
          <button
            type="button"
            title="התאם לרוחב"
            onClick={fitWidth}
            className="rounded p-1 hover:bg-muted"
          >
            <Maximize2 className="size-4" />
          </button>
          <button
            type="button"
            title="ברירת מחדל"
            onClick={zoomReset}
            className="rounded p-1 hover:bg-muted"
          >
            <RotateCcw className="size-4" />
          </button>
        </div>
        {reanchorId && (
          <div
            dir="rtl"
            className="absolute end-2 top-2 z-20 flex gap-1 rounded-md border bg-background/95 px-2 py-1 text-xs shadow"
          >
            <span className="self-center">עיגון מחדש:</span>
            <button
              className={`rounded px-2 py-0.5 ${
                drawMode ? 'bg-muted' : 'bg-primary text-primary-foreground'
              }`}
              onClick={() => setDrawMode(false)}
            >
              סמן טקסט
            </button>
            <button
              className={`rounded px-2 py-0.5 ${
                drawMode ? 'bg-primary text-primary-foreground' : 'bg-muted'
              }`}
              onClick={() => setDrawMode(true)}
            >
              צייר מלבן
            </button>
            <button className="rounded px-2 py-0.5 hover:bg-muted" onClick={handleCancelReanchor}>
              ביטול
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function closestPageEl(node: Node): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur.nodeType !== 1) cur = cur.parentNode;
  let el = cur as HTMLElement | null;
  while (el && !el.hasAttribute?.('data-page-num')) el = el.parentElement;
  return el;
}

/**
 * Convert a Rect (PDF points, mupdf top-left origin) to CSS pixels using the
 * viewer's `cssScale` (CSS-pixels per PDF-point). mupdf and CSS share the
 * top-left origin, so it's a straight scale — no Y flip needed.
 */
function pdfRectToCss(
  r: Rect,
  cssScale: number,
): { left: number; top: number; width: number; height: number } | null {
  const left = r.x0 * cssScale;
  const top = r.y0 * cssScale;
  const width = (r.x1 - r.x0) * cssScale;
  const height = (r.y1 - r.y0) * cssScale;
  if (width < 1 || height < 1) return null;
  return { left, top, width, height };
}

function cssRectToPdfRect(
  css: { left: number; top: number; width: number; height: number },
  cssScale: number,
): Rect | null {
  if (cssScale <= 0) return null;
  const x0 = css.left / cssScale;
  const y0 = css.top / cssScale;
  const x1 = (css.left + css.width) / cssScale;
  const y1 = (css.top + css.height) / cssScale;
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x0, y0, x1, y1 };
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
