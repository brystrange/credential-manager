import { useState, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FiZoomIn, FiZoomOut, FiSidebar, FiSearch, FiChevronDown, FiChevronUp, FiX, FiDownload, FiAlertCircle } from 'react-icons/fi';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './PDFEditor.css';

// Use the worker file copied to public/ — guaranteed to be served as a static asset
// at the site root, works on all browsers including mobile.
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

interface PDFEditorProps {
  url: string | { data: Uint8Array };
  blobUrl?: string; // original blob URL for download fallback
  onContainerClick?: () => void;
}

export default function PDFEditor({ url, blobUrl, onContainerClick }: PDFEditorProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(1.2);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [activePage, setActivePage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoadError(null);
  }

  function onDocumentLoadError(error: Error) {
    console.error("PDF load error:", error);
    setLoadError(error.message || "Unknown error loading PDF");
  }

  const handleScrollToPage = (pageIndex: number) => {
    setActivePage(pageIndex);
    const pageEl = document.getElementById(`pdf-page-${pageIndex}`);
    if (pageEl && wrapperRef.current) {
        const wrapper = wrapperRef.current;
        const topPos = pageEl.offsetTop - wrapper.offsetTop - 24;
        wrapper.scrollTo({ top: topPos, behavior: 'smooth' });
    }
  };

  const executeFind = (backwards = false) => {
    if (!findText) return;
    const found = (window as any).find(findText, false, backwards, true, false, false, false);
    if (!found) {
        console.log("Text not found");
    }
  };

  const handleDownloadFallback = () => {
    const downloadUrl = blobUrl || (typeof url === 'string' ? url : null);
    if (!downloadUrl) return;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = 'document.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  if (loadError) {
    return (
      <div className="pdf-editor-container" onClick={(e) => {
        e.stopPropagation();
        if (onContainerClick) onContainerClick();
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', gap: '16px', padding: '24px', textAlign: 'center', color: 'var(--text-secondary)'
        }}>
          <FiAlertCircle size={48} style={{ color: 'var(--warning)' }} />
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            Unable to preview this PDF on your device
          </p>
          <p style={{ fontSize: '0.85rem', maxWidth: '300px' }}>
            Your browser may not support in-app PDF rendering. You can download the file to view it.
          </p>
          {(blobUrl || typeof url === 'string') && (
            <button
              onClick={handleDownloadFallback}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '12px 24px', background: 'var(--accent)', color: '#000',
                border: 'none', borderRadius: 'var(--radius-md)', fontWeight: 600,
                cursor: 'pointer', fontSize: '0.95rem'
              }}
            >
              <FiDownload /> Download PDF
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pdf-editor-container" onClick={(e) => {
        e.stopPropagation();
        if (onContainerClick) onContainerClick();
    }}>
      <div className="pdf-toolbar">
        <div className="pdf-toolbar-group">
          <button 
            className="pdf-icon-btn" 
            onClick={() => setShowSidebar(!showSidebar)} 
            title="Toggle Sidebar"
            style={{ background: showSidebar ? '#e9ecef' : 'transparent', color: showSidebar ? '#0d6efd' : '#6c757d' }}
          >
            <FiSidebar />
          </button>
          <button 
            className="pdf-icon-btn" 
            onClick={() => {
                setShowFind(!showFind);
                if (!showFind) setTimeout(() => document.getElementById('pdf-find-input')?.focus(), 100);
            }} 
            title="Find"
            style={{ background: showFind ? '#e9ecef' : 'transparent', color: showFind ? '#0d6efd' : '#6c757d' }}
          >
            <FiSearch />
          </button>
        </div>

        <div className="pdf-toolbar-group pdf-toolbar-center">
          <button className="pdf-icon-btn" onClick={() => setScale(s => Math.max(0.5, s - 0.2))} title="Zoom Out">
            <FiZoomOut />
          </button>
          <span className="pdf-zoom-label">{Math.round(scale * 100)}%</span>
          <button className="pdf-icon-btn" onClick={() => setScale(s => Math.min(3, s + 0.2))} title="Zoom In">
            <FiZoomIn />
          </button>
        </div>
        
        <div className="pdf-toolbar-group" style={{ justifyContent: 'flex-end' }}>
             {/* Close button removed as requested */}
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
                onChange={e => setFindText(e.target.value)}
                onKeyDown={e => {
                    if (e.key === 'Enter') executeFind(e.shiftKey);
                }}
            />
            <button className="pdf-icon-btn" onClick={() => executeFind(true)} title="Previous"><FiChevronUp /></button>
            <button className="pdf-icon-btn" onClick={() => executeFind(false)} title="Next"><FiChevronDown /></button>
            <div style={{ flex: 1 }}></div>
            <button className="pdf-icon-btn" onClick={() => setShowFind(false)}><FiX /></button>
        </div>
      )}

      <div className="pdf-layout">
          {showSidebar && (
              <div className="pdf-sidebar">
                  <Document file={url} onLoadError={() => {}}>
                          {Array.from(new Array(numPages || 0), (_, index) => (
                              <div 
                                key={`thumb_${index}`} 
                                className={`pdf-sidebar-item ${activePage === index + 1 ? 'active' : ''}`}
                                onClick={() => handleScrollToPage(index + 1)}
                              >
                                  <div className="pdf-sidebar-thumb">
                                      <Page 
                                        pageNumber={index + 1} 
                                        scale={0.15} 
                                        renderTextLayer={false}
                                        renderAnnotationLayer={false}
                                      />
                                  </div>
                                  <span className="pdf-sidebar-label">{index + 1}</span>
                              </div>
                          ))}
                  </Document>
              </div>
          )}

          <div className="pdf-document-wrapper" ref={wrapperRef}>
            <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                className="pdf-document"
                loading={
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
                    Loading PDF…
                  </div>
                }
            >
                  {Array.from(new Array(numPages || 0), (_, index) => (
                    <div 
                      key={`page_${index + 1}`} 
                      id={`pdf-page-${index + 1}`}
                      className="pdf-page-container"
                      style={{ position: 'relative' }}
                    >
                      <Page 
                        pageNumber={index + 1} 
                        scale={scale} 
                        renderTextLayer={true}
                        renderAnnotationLayer={false}
                      />
                    </div>
                  ))}
            </Document>
          </div>
      </div>
    </div>
  );
}
