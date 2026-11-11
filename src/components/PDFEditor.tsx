import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs, type DocumentProps, type PageProps } from 'react-pdf';

type DocumentCallback = Parameters<NonNullable<DocumentProps['onLoadSuccess']>>[0];
type PageCallback = Parameters<NonNullable<PageProps['onLoadSuccess']>>[0];
import {
  FiZoomIn,
  FiZoomOut,
  FiSidebar,
  FiSearch,
  FiChevronDown,
  FiChevronUp,
  FiX,
  FiRotateCw,
} from 'react-icons/fi';
import { attachDocumentPinchZoom, type LivePinchMeta } from '../utils/pinchZoom';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './PDFEditor.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

const MIN_PDF_SCALE = 0.35;
const MAX_PDF_SCALE = 4;

interface PDFEditorProps {
  url: string | { data: Uint8Array };
  onContainerClick?: () => void;
}

interface LazyPdfPageProps {
  pageNumber: number;
  scale: number;
  rotation: number;
  scrollRoot: HTMLDivElement | null;
  defaultSize: { width: number; height: number };
  forceRender: boolean;
  searchQuery: string;
  isActiveSearchPage: boolean;
  onBecomeVisible: (pageNumber: number) => void;
}

function applyTextHighlights(
  container: HTMLElement | null,
  searchQuery: string,
  scrollToFirstMatch: boolean
) {
  if (!container) return;
  const spans = container.querySelectorAll<HTMLSpanElement>('.react-pdf__Page__textContent span');
  const q = searchQuery.trim().toLowerCase();
  let scrolled = false;

  spans.forEach((span) => {
    span.classList.remove('pdf-search-match', 'pdf-search-match-active');
    if (!q) return;
    const text = (span.textContent || '').toLowerCase();
    if (text.includes(q)) {
      span.classList.add('pdf-search-match');
      if (scrollToFirstMatch && !scrolled) {
        span.classList.add('pdf-search-match-active');
        scrolled = true;
        span.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
      }
    }
  });
}

function LazyPdfPage({
  pageNumber,
  scale,
  rotation,
  scrollRoot,
  defaultSize,
  forceRender,
  searchQuery,
  isActiveSearchPage,
  onBecomeVisible,
}: LazyPdfPageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inRange, setInRange] = useState(pageNumber <= 2);
  const [pageSize, setPageSize] = useState(defaultSize);
  const [textRendered, setTextRendered] = useState(false);

  // Sync default size before individual page loads
  useEffect(() => {
    setPageSize((prev) =>
      prev.width === 612 && prev.height === 792 ? defaultSize : prev
    );
  }, [defaultSize]);

  // Pre-render pages within 900px of viewport to keep large PDFs fast and lightweight on mobile
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !scrollRoot) return;

    const renderObserver = new IntersectionObserver(
      ([entry]) => {
        setInRange(entry.isIntersecting);
      },
      { root: scrollRoot, rootMargin: '900px 0px', threshold: 0 }
    );
    renderObserver.observe(el);

    const visibleObserver = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onBecomeVisible(pageNumber);
        }
      },
      { root: scrollRoot, rootMargin: '-42% 0px -42% 0px', threshold: 0 }
    );
    visibleObserver.observe(el);

    return () => {
      renderObserver.disconnect();
      visibleObserver.disconnect();
    };
  }, [scrollRoot, pageNumber, onBecomeVisible]);

  // Re-apply search highlights whenever searchQuery or active match changes
  useEffect(() => {
    if (!textRendered) return;
    applyTextHighlights(containerRef.current, searchQuery, isActiveSearchPage);
  }, [searchQuery, isActiveSearchPage, textRendered]);

  const shouldRender = inRange || forceRender;
  const isRotatedSideways = rotation % 180 !== 0;
  const widthPx = (isRotatedSideways ? pageSize.height : pageSize.width) * scale;
  const heightPx = (isRotatedSideways ? pageSize.width : pageSize.height) * scale;

  return (
    <div
      ref={containerRef}
      id={`pdf-page-${pageNumber}`}
      className="pdf-page-container"
      style={{
        position: 'relative',
        minWidth: `${widthPx}px`,
        minHeight: `${heightPx}px`,
      }}
    >
      {shouldRender ? (
        <Page
          pageNumber={pageNumber}
          scale={scale}
          rotate={rotation}
          renderTextLayer={true}
          renderAnnotationLayer={false}
          onLoadSuccess={(page: PageCallback) => {
            setPageSize({
              width: page.originalWidth || defaultSize.width,
              height: page.originalHeight || defaultSize.height,
            });
          }}
          onRenderTextLayerSuccess={() => {
            setTextRendered(true);
            applyTextHighlights(containerRef.current, searchQuery, isActiveSearchPage);
          }}
        />
      ) : (
        <div
          className="pdf-page-placeholder"
          style={{ width: `${widthPx}px`, height: `${heightPx}px` }}
        >
          <span>Page {pageNumber}</span>
        </div>
      )}
    </div>
  );
}

function LazySidebarThumb({
  pageNumber,
  active,
  rotation,
  onClick,
}: {
  pageNumber: number;
  active: boolean;
  rotation: number;
  onClick: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(pageNumber <= 8);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { rootMargin: '300px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`pdf-sidebar-item ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <div className="pdf-sidebar-thumb" style={{ minHeight: '110px', minWidth: '84px' }}>
        {visible && (
          <Page
            pageNumber={pageNumber}
            scale={0.15}
            rotate={rotation}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        )}
      </div>
      <span className="pdf-sidebar-label">{pageNumber}</span>
    </div>
  );
}

export default function PDFEditor({ url, onContainerClick }: PDFEditorProps) {
  const initialDefaultScale = window.innerWidth <= 768 ? 0.6 : 1.15;
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(initialDefaultScale);
  const defaultScaleRef = useRef(initialDefaultScale);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const [pinchState, setPinchState] = useState<{
    ratio: number;
    dx: number;
    dy: number;
    originX: number;
    originY: number;
  }>({ ratio: 1, dx: 0, dy: 0, originX: 0, originY: 0 });

  const [rotation, setRotation] = useState(0);
  const [defaultPageSize, setDefaultPageSize] = useState({ width: 612, height: 792 });
  const [showSidebar, setShowSidebar] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [matchingPages, setMatchingPages] = useState<number[]>([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const [activePage, setActivePage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [passwordPrompt, setPasswordPrompt] = useState<{
    callback: (password: string) => void;
    reason: number;
  } | null>(null);
  const [passwordInput, setPasswordInput] = useState('');

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [scrollRootEl, setScrollRootEl] = useState<HTMLDivElement | null>(null);
  const setWrapperRef = useCallback((node: HTMLDivElement | null) => {
    wrapperRef.current = node;
    setScrollRootEl((prev) => (prev === node ? prev : node));
  }, []);
  const docElRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<DocumentCallback | null>(null);
  const pageTextCacheRef = useRef<Map<number, string>>(new Map());
  const pendingJumpPageRef = useRef<number | null>(null);

  useEffect(() => {
    setPageInput(String(activePage));
  }, [activePage]);

  // Attach mobile pinch-to-zoom + double-tap zoom + desktop Ctrl+Wheel zoom once wrapperRef mounts
  useEffect(() => {
    const el = scrollRootEl;
    if (!el) return;

    const cleanupPinch = attachDocumentPinchZoom({
      target: el,
      scrollEl: el,
      getContentEl: () => docElRef.current,
      getScale: () => scaleRef.current,
      minScale: MIN_PDF_SCALE,
      maxScale: MAX_PDF_SCALE,
      onLivePinch: (ratio: number, meta?: LivePinchMeta) => {
        setPinchState({
          ratio,
          dx: meta?.dx || 0,
          dy: meta?.dy || 0,
          originX: meta?.originX || 0,
          originY: meta?.originY || 0,
        });
      },
      onCommitScale: (next) => setScale(next),
      onDoubleTap: (clientX, clientY) => {
        const curScale = scaleRef.current;
        const baseDefault = defaultScaleRef.current;
        const targetScale =
          curScale > baseDefault * 1.25
            ? baseDefault
            : Math.min(2.6, Number((baseDefault * 1.85).toFixed(2)));
        const rect = el.getBoundingClientRect();
        const offsetX = clientX - rect.left;
        const offsetY = clientY - rect.top;
        const oldScrollLeft = el.scrollLeft;
        const oldScrollTop = el.scrollTop;
        const factor = targetScale / curScale;

        setScale(targetScale);
        requestAnimationFrame(() => {
          el.scrollLeft = Math.max(0, (oldScrollLeft + offsetX) * factor - offsetX);
          el.scrollTop = Math.max(0, (oldScrollTop + offsetY) * factor - offsetY);
        });
      },
    });

    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.15 : -0.15;
      setScale((prev) =>
        Math.max(MIN_PDF_SCALE, Math.min(MAX_PDF_SCALE, Number((prev + delta).toFixed(2))))
      );
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      cleanupPinch();
      el.removeEventListener('wheel', handleWheel);
    };
  }, [scrollRootEl]);

  const handlePassword = (callback: (password: string) => void, reason: number) => {
    setPasswordPrompt({ callback, reason });
    setPasswordInput('');
  };

  const documentFile = useMemo(() => {
    if (typeof url === 'string') return url;
    return { data: url.data };
  }, [typeof url === 'string' ? url : url.data]);

  async function onDocumentLoadSuccess(pdf: DocumentCallback) {
    pdfDocRef.current = pdf;
    pageTextCacheRef.current.clear();
    setNumPages(pdf.numPages);
    setActivePage(1);

    try {
      const firstPage = await pdf.getPage(1);
      const vp = firstPage.getViewport({ scale: 1 });
      setDefaultPageSize({ width: vp.width, height: vp.height });

      if (window.innerWidth <= 768 && vp.width > 0) {
        const fitScale = Math.max(
          0.42,
          Math.min(1, Number(((window.innerWidth - 36) / vp.width).toFixed(2)))
        );
        defaultScaleRef.current = fitScale;
        setScale(fitScale);
      }
    } catch {
      // Fallback to default page sizing
    }
  }

  const handleScrollToPage = useCallback((pageIndex: number) => {
    if (!numPages) return;
    const clamped = Math.max(1, Math.min(numPages, pageIndex));
    setActivePage(clamped);
    pendingJumpPageRef.current = clamped;

    requestAnimationFrame(() => {
      const pageEl = document.getElementById(`pdf-page-${clamped}`);
      if (pageEl && wrapperRef.current) {
        const wrapper = wrapperRef.current;
        const topPos = pageEl.offsetTop - wrapper.offsetTop - 20;
        wrapper.scrollTo({ top: Math.max(0, topPos), behavior: 'smooth' });
      }
      setTimeout(() => {
        if (pendingJumpPageRef.current === clamped) {
          pendingJumpPageRef.current = null;
        }
      }, 600);
    });
  }, [numPages]);

  const handleBecomeVisible = useCallback((pageNumber: number) => {
    if (pendingJumpPageRef.current !== null && pendingJumpPageRef.current !== pageNumber) {
      return;
    }
    setActivePage(pageNumber);
  }, []);

  const searchInDocument = async (queryText: string): Promise<number[]> => {
    const pdf = pdfDocRef.current;
    const q = queryText.trim().toLowerCase();
    if (!pdf || !q) {
      setMatchingPages([]);
      setActiveQuery('');
      return [];
    }

    setSearching(true);
    try {
      const hits: number[] = [];
      for (let p = 1; p <= pdf.numPages; p++) {
        let pageText = pageTextCacheRef.current.get(p);
        if (pageText === undefined) {
          const page = await pdf.getPage(p);
          const textContent = await page.getTextContent();
          const extracted = textContent.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
            .toLowerCase();
          pageText = extracted;
          pageTextCacheRef.current.set(p, extracted);
        }
        if (pageText.includes(q)) {
          hits.push(p);
        }
      }
      setActiveQuery(queryText.trim());
      setMatchingPages(hits);
      return hits;
    } finally {
      setSearching(false);
    }
  };

  const executeFind = async (backwards = false) => {
    const trimmed = findText.trim();
    if (!trimmed) {
      setActiveQuery('');
      setMatchingPages([]);
      return;
    }

    let pages = matchingPages;
    let nextIdx = activeMatchIdx;

    if (trimmed !== activeQuery) {
      pages = await searchInDocument(trimmed);
      nextIdx = backwards ? Math.max(0, pages.length - 1) : 0;
    } else if (pages.length > 0) {
      nextIdx = backwards
        ? (activeMatchIdx - 1 + pages.length) % pages.length
        : (activeMatchIdx + 1) % pages.length;
    }

    setActiveMatchIdx(nextIdx);
    if (pages.length > 0) {
      handleScrollToPage(pages[nextIdx]);
    }
  };

  const activeSearchPage = matchingPages.length > 0 ? matchingPages[activeMatchIdx] ?? null : null;
  const isPinching = pinchState.ratio !== 1 || pinchState.dx !== 0 || pinchState.dy !== 0;

  return (
    <div
      className="pdf-editor-container"
      onClick={(e) => {
        e.stopPropagation();
        if (onContainerClick) onContainerClick();
      }}
    >
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-group">
          <button
            className="pdf-icon-btn"
            onClick={() => setShowSidebar(!showSidebar)}
            title="Toggle Sidebar"
            style={{
              background: showSidebar ? '#e9ecef' : 'transparent',
              color: showSidebar ? '#0d6efd' : '#6c757d',
            }}
          >
            <FiSidebar />
          </button>
          <button
            className="pdf-icon-btn"
            onClick={() => {
              const nextOpen = !showFind;
              setShowFind(nextOpen);
              if (nextOpen) {
                setTimeout(() => document.getElementById('pdf-find-input')?.focus(), 100);
              } else {
                setActiveQuery('');
                setMatchingPages([]);
              }
            }}
            title="Find"
            style={{
              background: showFind ? '#e9ecef' : 'transparent',
              color: showFind ? '#0d6efd' : '#6c757d',
            }}
          >
            <FiSearch />
          </button>
          <button
            className="pdf-icon-btn"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            title="Rotate 90°"
          >
            <FiRotateCw />
          </button>
        </div>

        <div className="pdf-toolbar-group pdf-toolbar-center">
          <button
            className="pdf-icon-btn"
            onClick={() => setScale((s) => Math.max(MIN_PDF_SCALE, Number((s - 0.2).toFixed(2))))}
            title="Zoom Out"
          >
            <FiZoomOut />
          </button>
          <button
            type="button"
            className="pdf-zoom-label pdf-zoom-reset"
            onClick={() => setScale(defaultScaleRef.current)}
            title="Reset Zoom to Fit"
          >
            {Math.round(scale * pinchState.ratio * 100)}%
          </button>
          <button
            className="pdf-icon-btn"
            onClick={() => setScale((s) => Math.min(MAX_PDF_SCALE, Number((s + 0.2).toFixed(2))))}
            title="Zoom In"
          >
            <FiZoomIn />
          </button>
        </div>

        <div className="pdf-toolbar-group" style={{ justifyContent: 'flex-end' }}>
          {numPages !== null && (
            <form
              className="pdf-page-jump"
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = parseInt(pageInput, 10);
                if (!Number.isNaN(parsed)) handleScrollToPage(parsed);
                else setPageInput(String(activePage));
              }}
            >
              <input
                type="number"
                min={1}
                max={numPages}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => {
                  const parsed = parseInt(pageInput, 10);
                  if (!Number.isNaN(parsed) && parsed !== activePage) {
                    handleScrollToPage(parsed);
                  } else {
                    setPageInput(String(activePage));
                  }
                }}
                aria-label="Current page"
                className="pdf-page-input"
              />
              <span className="pdf-page-total">/ {numPages}</span>
            </form>
          )}
        </div>
      </div>

      {showFind && (
        <div className="pdf-find-bar">
          <input
            id="pdf-find-input"
            type="text"
            className="pdf-find-input"
            placeholder="Find in document..."
            value={findText}
            onChange={(e) => {
              setFindText(e.target.value);
              if (!e.target.value.trim()) {
                setActiveQuery('');
                setMatchingPages([]);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void executeFind(e.shiftKey);
              }
            }}
          />
          {activeQuery && (
            <span className="pdf-find-count">
              {searching
                ? 'Searching...'
                : matchingPages.length > 0
                ? `Page ${activeMatchIdx + 1}/${matchingPages.length}`
                : '0 matches'}
            </span>
          )}
          <button
            className="pdf-icon-btn"
            onClick={() => void executeFind(true)}
            title="Previous match"
            disabled={searching}
          >
            <FiChevronUp />
          </button>
          <button
            className="pdf-icon-btn"
            onClick={() => void executeFind(false)}
            title="Next match"
            disabled={searching}
          >
            <FiChevronDown />
          </button>
          <div style={{ flex: 1 }} />
          <button
            className="pdf-icon-btn"
            onClick={() => {
              setShowFind(false);
              setActiveQuery('');
              setMatchingPages([]);
            }}
          >
            <FiX />
          </button>
        </div>
      )}

      <div className="pdf-layout">
        <Document
          file={documentFile}
          onLoadSuccess={onDocumentLoadSuccess}
          onPassword={handlePassword}
          className="pdf-document-root"
        >
          {showSidebar && (
            <div className="pdf-sidebar">
              {Array.from(new Array(numPages || 0), (_, index) => (
                <LazySidebarThumb
                  key={`thumb_${index}`}
                  pageNumber={index + 1}
                  active={activePage === index + 1}
                  rotation={rotation}
                  onClick={() => handleScrollToPage(index + 1)}
                />
              ))}
            </div>
          )}

          <div className="pdf-document-wrapper" ref={setWrapperRef}>
            <div
              ref={docElRef}
              className="pdf-document"
              style={{
                transform: isPinching
                  ? `translate(${pinchState.dx}px, ${pinchState.dy}px) scale(${pinchState.ratio})`
                  : undefined,
                transformOrigin: isPinching
                  ? `${pinchState.originX}px ${pinchState.originY}px`
                  : 'top left',
                transition: isPinching ? 'none' : undefined,
              }}
            >
              {Array.from(new Array(numPages || 0), (_, index) => {
                const pageNum = index + 1;
                return (
                  <LazyPdfPage
                    key={`page_${pageNum}`}
                    pageNumber={pageNum}
                    scale={scale}
                    rotation={rotation}
                    scrollRoot={scrollRootEl}
                    defaultSize={defaultPageSize}
                    forceRender={pageNum === activePage || pageNum === activeSearchPage}
                    searchQuery={activeQuery}
                    isActiveSearchPage={pageNum === activeSearchPage}
                    onBecomeVisible={handleBecomeVisible}
                  />
                );
              })}
            </div>
          </div>
        </Document>
      </div>

      {passwordPrompt && (
        <div className="modal-overlay" style={{ zIndex: 9999, background: 'rgba(0, 0, 0, 0.8)' }}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '400px' }}>
            <h3>Password Required</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {passwordPrompt.reason === 2
                ? 'Incorrect password. Please try again.'
                : 'This PDF is password protected. Enter the password to view.'}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (passwordInput) {
                  passwordPrompt.callback(passwordInput);
                  setPasswordPrompt(null);
                }
              }}
            >
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter password..."
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  marginBottom: '20px',
                }}
              />
              <div className="confirm-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    if (onContainerClick) onContainerClick();
                    setPasswordPrompt(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={!passwordInput}>
                  Open
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
