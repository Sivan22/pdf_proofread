import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import { PdfViewer, type PdfPageMeta, type PdfViewerHandle } from './PdfViewer';
import { FixCard } from './FixCard';
import type { BatchProgress, ProofErrorRow } from '../runner/orchestrator';
import type { Rect } from '../pdf/mupdf';

interface Props {
  pdfBlob: Blob | null;
  rows: ProofErrorRow[];
  batches: Map<number, BatchProgress>;
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

export function ReviewTab({ pdfBlob, rows, batches, onSaveRow, onDeleteRow, onReanchorRow }: Props) {
  const viewerRef = useRef<PdfViewerHandle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reanchorId, setReanchorId] = useState<string | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const drawState = useRef<DrawState | null>(null);
  const [, forceTick] = useState(0);

  // Per-page viewport cache so DOM selection rects can be converted to PDF
  // points correctly. Updated each time `renderOverlay` runs for a page.
  const pageViewports = useRef<Map<number, { viewport: PageViewport; pdfHeight: number }>>(
    new Map(),
  );

  const rowsByPage = useMemo(() => {
    const m = new Map<number, ProofErrorRow[]>();
    for (const row of rows) {
      const arr = m.get(row.page) ?? [];
      arr.push(row);
      m.set(row.page, arr);
    }
    return m;
  }, [rows]);

  useEffect(() => {
    if (!selectedId) return;
    const row = rows.find((r) => r.id === selectedId);
    if (row) viewerRef.current?.scrollToPage(row.page);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartReanchor = (id: string) => {
    setReanchorId(id);
    setSelectedId(id);
    setDrawMode(false);
    const row = rows.find((r) => r.id === id);
    if (row) viewerRef.current?.scrollToPage(row.page);
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
      const vpEntry = pageViewports.current.get(pageNum);
      if (!vpEntry) return;
      const pageRect = startEl.getBoundingClientRect();
      const clientRects = Array.from(range.getClientRects());
      if (clientRects.length === 0) return;
      const rects: Rect[] = clientRects
        .map((cr) => {
          const cssRect = {
            left: cr.left - pageRect.left,
            top: cr.top - pageRect.top,
            width: cr.width,
            height: cr.height,
          };
          return cssRectToPdfRect(cssRect, vpEntry.viewport, vpEntry.pdfHeight);
        })
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
    (meta: PdfPageMeta, viewport: PageViewport) => {
      pageViewports.current.set(meta.pageNum, { viewport, pdfHeight: meta.pdfHeight });
      const pageRows = rowsByPage.get(meta.pageNum) ?? [];

      const highlightEls = pageRows.flatMap((row) =>
        row.rects.map((r, i) => {
          const css = pdfRectToCss(r, viewport, meta.pdfHeight);
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
                const pdfRect = cssRectToPdfRect(cssRect, viewport, meta.pdfHeight);
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
        <PdfViewer ref={viewerRef} blob={pdfBlob} renderOverlay={renderOverlay} />
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

function pdfRectToCss(
  r: Rect,
  viewport: PageViewport,
  pdfHeight: number,
): { left: number; top: number; width: number; height: number } | null {
  const [vx0, vy0] = viewport.convertToViewportPoint(r.x0, pdfHeight - r.y0);
  const [vx1, vy1] = viewport.convertToViewportPoint(r.x1, pdfHeight - r.y1);
  const left = Math.min(vx0, vx1);
  const top = Math.min(vy0, vy1);
  const width = Math.abs(vx1 - vx0);
  const height = Math.abs(vy1 - vy0);
  if (width < 1 || height < 1) return null;
  return { left, top, width, height };
}

function cssRectToPdfRect(
  css: { left: number; top: number; width: number; height: number },
  viewport: PageViewport,
  pdfHeight: number,
): Rect | null {
  const [px0, py0] = viewport.convertToPdfPoint(css.left, css.top);
  const [px1, py1] = viewport.convertToPdfPoint(css.left + css.width, css.top + css.height);
  const x0 = Math.min(px0, px1);
  const x1 = Math.max(px0, px1);
  const yUpMin = Math.min(py0, py1);
  const yUpMax = Math.max(py0, py1);
  const y0 = pdfHeight - yUpMax;
  const y1 = pdfHeight - yUpMin;
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x0, y0, x1, y1 };
}
