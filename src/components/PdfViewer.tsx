import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import * as mupdf from 'mupdf';
import { extractPageContent, type PageContent, type TextBlock } from '../pdf/textmap';

export interface PdfViewerHandle {
  scrollToPage: (pageNum: number) => void;
  /**
   * Scroll so a specific rect on `pageNum` is visible. `rect` is in PDF points
   * using mupdf top-left origin (matches `Rect` in mupdf.ts). The rect's
   * vertical center is positioned ~⅓ from the top of the viewport so the user
   * has context above the highlight.
   */
  scrollToRect: (
    pageNum: number,
    rect: { y0: number; y1: number },
  ) => void;
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
  renderOverlay?: (meta: PdfPageMeta) => React.ReactNode;
  /** Click in empty page area (bubbles up from any page). */
  onPageClick?: (pageNum: number) => void;
}

/**
 * Render PDFs via mupdf — the same engine that produces the page images we
 * send to the LLM and that drives our text extraction. pdf.js was rendering
 * custom Hebrew typesetter fonts incorrectly (glyphs at wrong codepoints,
 * letter-spacing artefacts); mupdf handles them correctly because we already
 * map the font glyph slots in `textmap.ts`.
 *
 * For each page we keep the rendered PNG (rasterised at viewer DPI) and the
 * extracted text blocks, then build an invisible text layer of per-char spans
 * positioned at each glyph's quad. The text content matches what the LLM
 * sees, so selection-based re-anchoring picks up the same characters.
 */
export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer(
  { blob, scale = 1.4, renderOverlay, onPageClick },
  ref,
) {
  const [doc, setDoc] = useState<mupdf.PDFDocument | null>(null);
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
    (async () => {
      const buffer = await blob.arrayBuffer();
      if (cancelled) return;
      const generic = mupdf.Document.openDocument(
        new Uint8Array(buffer),
        'application/pdf',
      );
      const d = generic.asPDF();
      if (!d || cancelled) return;
      const metas: PdfPageMeta[] = [];
      const cnt = d.countPages();
      for (let i = 0; i < cnt; i++) {
        const page = d.loadPage(i);
        const [, , pdfW, pdfH] = page.getBounds();
        metas.push({
          pageNum: i + 1,
          width: pdfW * scale,
          height: pdfH * scale,
          pdfWidth: pdfW,
          pdfHeight: pdfH,
        });
      }
      if (!cancelled) {
        setDoc(d);
        setPageMetas(metas);
      }
    })();
    return () => {
      cancelled = true;
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
      scrollToRect(pageNum, rect) {
        const el = pageRefs.current.get(pageNum);
        const meta = pageMetas.find((m) => m.pageNum === pageNum);
        const container = containerRef.current;
        if (!el || !meta || !container) return;
        const pageTop =
          el.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop;
        const cssScale = meta.height / meta.pdfHeight;
        const rectCenterCss = ((rect.y0 + rect.y1) / 2) * cssScale;
        const targetTop = pageTop + rectCenterCss - container.clientHeight / 3;
        container.scrollTo({
          top: Math.max(0, targetTop),
          behavior: 'smooth',
        });
      },
    }),
    [pageMetas],
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
  doc: mupdf.PDFDocument;
  meta: PdfPageMeta;
  scale: number;
  renderOverlay?: (meta: PdfPageMeta) => React.ReactNode;
  onClick?: () => void;
  registerRef: (el: HTMLDivElement | null) => void;
  rootEl: HTMLDivElement | null;
}

function PdfPage({
  doc,
  meta,
  scale,
  renderOverlay,
  onClick,
  registerRef,
  rootEl,
}: PdfPageProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pageContent, setPageContent] = useState<PageContent | null>(null);
  const [visible, setVisible] = useState(false);

  // Lazy-render: only fetch + render this page when it (or one neighbouring
  // page) is in the scroll viewport.
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
    if (!visible || pageContent) return;
    let cancelled = false;
    let url: string | null = null;
    try {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const dpi = scale * 72 * dpr;
      const pc = extractPageContent(doc, meta.pageNum - 1, dpi);
      if (cancelled) return;
      url = URL.createObjectURL(
        new Blob([pc.imagePng as BlobPart], { type: 'image/png' }),
      );
      setImageUrl(url);
      setPageContent(pc);
    } catch (e) {
      console.error('mupdf render failed', e);
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [visible, doc, meta.pageNum, scale, pageContent]);

  const cssScale = meta.height / meta.pdfHeight;

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
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 select-none"
          style={{ width: '100%', height: '100%' }}
        />
      )}
      {pageContent && (
        <div
          className="textLayer absolute inset-0"
          style={{
            color: 'transparent',
            lineHeight: 1,
            userSelect: 'text',
            pointerEvents: 'auto',
          }}
        >
          {pageContent.blocks.map((block) => (
            <TextLayerBlock
              key={block.index}
              block={block}
              cssScale={cssScale}
            />
          ))}
        </div>
      )}
      {pageContent && renderOverlay && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 3 }}
        >
          {renderOverlay(meta)}
        </div>
      )}
    </div>
  );
}

/**
 * Render a block's chars as absolutely-positioned, fully-transparent spans.
 * The page's PNG provides the visible glyphs underneath; these spans exist
 * so the user can select text (re-anchor mode, copy/paste). Selection
 * geometry comes from each span's bounding box, so the rectangles match the
 * underlying glyphs even though the text itself is invisible.
 */
function TextLayerBlock({
  block,
  cssScale,
}: {
  block: TextBlock;
  cssScale: number;
}) {
  const items: React.ReactNode[] = [];
  for (let i = 0; i < block.text.length; i++) {
    const ch = block.text[i];
    const q = block.quads[i];
    if (!q || ch === '\n') continue;
    const a = q as unknown as number[];
    const xs = [a[0], a[2], a[4], a[6]];
    const ys = [a[1], a[3], a[5], a[7]];
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const w = (x1 - x0) * cssScale;
    const h = (y1 - y0) * cssScale;
    if (w < 0.5 || h < 0.5) continue;
    items.push(
      <span
        key={i}
        style={{
          position: 'absolute',
          left: x0 * cssScale,
          top: y0 * cssScale,
          width: w,
          height: h,
          fontSize: h,
          whiteSpace: 'pre',
        }}
      >
        {ch}
      </span>,
    );
  }
  return <>{items}</>;
}
