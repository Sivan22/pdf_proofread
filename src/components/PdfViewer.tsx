import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type {
  PDFDocumentProxy,
  PDFPageProxy,
} from 'pdfjs-dist/types/src/display/api';
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export interface PdfViewerHandle {
  scrollToPage: (pageNum: number) => void;
}

export interface PdfPageMeta {
  pageNum: number;
  /** Width/height in CSS pixels at the current viewer scale. */
  width: number;
  height: number;
  /** PDF intrinsic dimensions in points. */
  pdfWidth: number;
  pdfHeight: number;
}

export interface PdfViewerProps {
  blob: Blob | null;
  scale?: number;
  /** Per-page overlay render prop. Children are absolutely-positioned on top of the page. */
  renderOverlay?: (meta: PdfPageMeta, viewport: PageViewport) => React.ReactNode;
  /** Click in empty page area (bubbles up from any page). */
  onPageClick?: (pageNum: number) => void;
}

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer(
  { blob, scale = 1.4, renderOverlay, onPageClick },
  ref,
) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageMetas, setPageMetas] = useState<PdfPageMeta[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!blob) {
      setDoc(null);
      setPageMetas([]);
      return;
    }
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    (async () => {
      const buffer = await blob.arrayBuffer();
      const task = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const d = await task.promise;
      if (cancelled) {
        d.destroy();
        return;
      }
      loaded = d;
      setDoc(d);
      const metas: PdfPageMeta[] = [];
      for (let i = 1; i <= d.numPages; i++) {
        const page = await d.getPage(i);
        const vp = page.getViewport({ scale });
        metas.push({
          pageNum: i,
          width: vp.width,
          height: vp.height,
          pdfWidth: page.view[2] - page.view[0],
          pdfHeight: page.view[3] - page.view[1],
        });
      }
      if (!cancelled) setPageMetas(metas);
    })();
    return () => {
      cancelled = true;
      if (loaded) loaded.destroy();
    };
  }, [blob, scale]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToPage(pageNum: number) {
        const el = pageRefs.current.get(pageNum);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }),
    [],
  );

  return (
    <div
      ref={containerRef}
      dir="ltr"
      className="relative h-full overflow-auto bg-muted"
    >
      {doc && pageMetas.map((meta) => (
        <PdfPage
          key={meta.pageNum}
          doc={doc}
          meta={meta}
          scale={scale}
          renderOverlay={renderOverlay}
          onClick={() => onPageClick?.(meta.pageNum)}
          registerRef={(el) => {
            if (el) pageRefs.current.set(meta.pageNum, el);
            else pageRefs.current.delete(meta.pageNum);
          }}
          rootEl={containerRef.current}
        />
      ))}
    </div>
  );
});

interface PdfPageProps {
  doc: PDFDocumentProxy;
  meta: PdfPageMeta;
  scale: number;
  renderOverlay?: (meta: PdfPageMeta, viewport: PageViewport) => React.ReactNode;
  onClick?: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
  rootEl: HTMLDivElement | null;
}

function PdfPage({ doc, meta, scale, renderOverlay, onClick, registerRef, rootEl }: PdfPageProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [visible, setVisible] = useState(false);

  // Lazy-render: only fetch + render this page's canvas+textLayer when it
  // (or one neighbouring page) is in the scroll viewport.
  useEffect(() => {
    if (!wrapperRef.current) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { root: rootEl ?? null, rootMargin: '500px 0px' },
    );
    io.observe(wrapperRef.current);
    return () => io.disconnect();
  }, [rootEl]);

  useEffect(() => {
    if (!visible || rendered) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;
    let textLayer: { cancel: () => void } | null = null;
    (async () => {
      const page: PDFPageProxy = await doc.getPage(meta.pageNum);
      const vp = page.getViewport({ scale });
      if (cancelled) return;
      const canvas = canvasRef.current;
      const tl = textLayerRef.current;
      if (!canvas || !tl) return;
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${vp.width}px`;
      canvas.style.height = `${vp.height}px`;
      const transform: number[] = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : [1, 0, 0, 1, 0, 0];
      const task = page.render({
        canvas,
        viewport: vp,
        transform,
      });
      renderTask = task;
      try {
        await task.promise;
      } catch (e) {
        if (!cancelled) console.error('pdf render failed', e);
        return;
      }
      if (cancelled) return;

      // Text layer for selection.
      tl.replaceChildren();
      const textContentSource = page.streamTextContent({
        includeMarkedContent: true,
        disableNormalization: true,
      });
      const layer = new pdfjsLib.TextLayer({
        textContentSource,
        container: tl,
        viewport: vp,
      });
      textLayer = layer;
      try {
        await layer.render();
      } catch (e) {
        if (!cancelled) console.error('text layer failed', e);
      }
      if (cancelled) return;
      setViewport(vp);
      setRendered(true);
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayer?.cancel();
    };
  }, [visible, rendered, doc, meta.pageNum, scale]);

  return (
    <div
      ref={(el) => {
        wrapperRef.current = el;
        registerRef(el);
      }}
      data-page-num={meta.pageNum}
      className="relative mx-auto my-4 bg-white shadow-md"
      style={{ width: meta.width, height: meta.height }}
      onClick={onClick}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      <div
        ref={textLayerRef}
        className="textLayer absolute inset-0"
        style={{
          color: 'transparent',
          lineHeight: 1,
          userSelect: 'text',
          pointerEvents: 'auto',
        }}
      />
      {rendered && viewport && renderOverlay && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 3 }}
        >
          {renderOverlay(meta, viewport)}
        </div>
      )}
    </div>
  );
}
