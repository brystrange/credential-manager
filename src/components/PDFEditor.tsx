import { useState, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FiZoomIn, FiZoomOut, FiSidebar, FiSearch, FiChevronDown, FiChevronUp, FiX } from 'react-icons/fi';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './PDFEditor.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface PDFEditorProps {
  url: string | { data: Uint8Array };
  onContainerClick?: () => void;
}

export default function PDFEditor({ url, onContainerClick }: PDFEditorProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [scale, setScale] = useState(window.innerWidth <= 768 ? 0.6 : 1.2);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showFind, setShowFind] = useState(false);
  const [findText, setFindText] = useState("");
  const [activePage, setActivePage] = useState(1);
  const [passwordPrompt, setPasswordPrompt] = useState<{ callback: (password: string) => void, reason: number } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handlePassword = (callback: (password: string) => void, reason: number) => {
    setPasswordPrompt({ callback, reason });
    setPasswordInput("");
  };

  const documentFile = useMemo(() => {
    if (typeof url === 'string') return url;
    return { data: url.data };
  }, [typeof url === 'string' ? url : url.data]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  const handleScrollToPage = (pageIndex: number) => {
    setActivePage(pageIndex);
    const pageEl = document.getElementById(`pdf-page-${pageIndex}`);
    if (pageEl && wrapperRef.current) {
        // Scroll the wrapper to the element
        const wrapper = wrapperRef.current;
        const topPos = pageEl.offsetTop - wrapper.offsetTop - 24;
        wrapper.scrollTo({ top: topPos, behavior: 'smooth' });
    }
  };

  const executeFind = (backwards = false) => {
    if (!findText) return;
    // Uses the browser's native find API to search through the rendered text layers
    // window.find(aString, aCaseSensitive, aBackwards, aWrapAround, aWholeWord, aSearchInFrames, aShowDialog);
    const found = (window as any).find(findText, false, backwards, true, false, false, false);
    if (!found) {
        // If not found, it might be off-screen. We could try to render all pages or rely on the user to scroll.
        // For now, native window.find works well since all pages are rendered.
        console.log("Text not found");
    }
  };

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
        <Document
          file={documentFile}
          onLoadSuccess={onDocumentLoadSuccess}
          onPassword={handlePassword}
          className="pdf-document-root"
        >
          {showSidebar && (
              <div className="pdf-sidebar">
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
              </div>
          )}

          <div className="pdf-document-wrapper" ref={wrapperRef}>
            <div className="pdf-document">
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
            </div>
          </div>
        </Document>
      </div>

      {passwordPrompt && (
        <div className="modal-overlay" style={{ zIndex: 9999, background: 'rgba(0, 0, 0, 0.8)' }}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '400px' }}>
                <h3>Password Required</h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    {passwordPrompt.reason === 2 ? "Incorrect password. Please try again." : "This PDF is password protected. Enter the password to view."}
                </p>
                <form onSubmit={(e) => {
                    e.preventDefault();
                    if (passwordInput) {
                        passwordPrompt.callback(passwordInput);
                        setPasswordPrompt(null);
                    }
                }}>
                    <input 
                        type="password"
                        value={passwordInput}
                        onChange={e => setPasswordInput(e.target.value)}
                        placeholder="Enter password..."
                        autoFocus
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', marginBottom: '20px' }}
                    />
                    <div className="confirm-actions">
                        <button type="button" className="btn-secondary" onClick={() => {
                            if (onContainerClick) onContainerClick();
                            setPasswordPrompt(null);
                        }}>
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
