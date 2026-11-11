import { useState, useRef, useMemo, useEffect, useCallback, type CSSProperties } from 'react';
import {
    FiSearch,
    FiChevronUp,
    FiChevronDown,
    FiX,
    FiCopy,
    FiCheck,
    FiSun,
    FiMoon,
    FiHash,
    FiAlignLeft,
    FiEye,
    FiCode,
    FiDownload,
} from 'react-icons/fi';
import { attachDocumentPinchZoom, type LivePinchMeta } from '../utils/pinchZoom';
import {
    getCodeLanguageInfo,
    highlightCodeLines,
    formatJsonSafely,
    applySearchHighlightToLineHtml,
    renderMarkdownHtml,
} from '../utils/codePreview';
import './CodeTextViewer.css';

const MAX_INITIAL_LINES = 4000;
const MAX_INITIAL_CHARS = 350_000;
const MAX_EXPANDABLE_CHARS = 2_000_000;
const MIN_CODE_ZOOM = 0.5;
const MAX_CODE_ZOOM = 3.5;

interface CodeTextViewerProps {
    fileName: string;
    mimeType: string;
    content: string;
    fileSize?: number;
    zoomLevel: number;
    onZoomChange: (nextZoom: number) => void;
    onDownload?: () => void;
    onContainerClick?: () => void;
}

function formatByteSize(bytes?: number): string {
    if (!bytes || bytes <= 0) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

export default function CodeTextViewer({
    fileName,
    mimeType,
    content,
    fileSize,
    zoomLevel,
    onZoomChange,
    onDownload,
    onContainerClick,
}: CodeTextViewerProps) {
    const langInfo = useMemo(() => getCodeLanguageInfo(fileName, mimeType), [fileName, mimeType]);
    const isBinary = useMemo(() => content.includes('\u0000'), [content]);

    const [viewMode, setViewMode] = useState<'code' | 'rendered'>(() =>
        langInfo.isMarkdown ? 'rendered' : 'code'
    );
    const [jsonPretty, setJsonPretty] = useState(true);
    const [showLineNumbers, setShowLineNumbers] = useState(true);
    const [wordWrap, setWordWrap] = useState(() => Boolean(langInfo.isLog || langInfo.id === 'plaintext'));
    const [editorTheme, setEditorTheme] = useState<'dark' | 'light'>('dark');
    const [showAllLines, setShowAllLines] = useState(false);

    const [showFind, setShowFind] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [activeMatchIdx, setActiveMatchIdx] = useState(0);
    const [copied, setCopied] = useState(false);

    const [pinchMeta, setPinchMeta] = useState<LivePinchMeta & { ratio: number }>({
        ratio: 1,
        dx: 0,
        dy: 0,
        originX: 0,
        originY: 0,
    });

    const scrollRef = useRef<HTMLDivElement>(null);
    const scaleWrapRef = useRef<HTMLDivElement>(null);
    const findInputRef = useRef<HTMLInputElement>(null);
    const effectiveZoom = Math.max(MIN_CODE_ZOOM, Math.min(MAX_CODE_ZOOM, zoomLevel));
    const zoomRef = useRef(effectiveZoom);
    const onZoomChangeRef = useRef(onZoomChange);

    useEffect(() => {
        zoomRef.current = effectiveZoom;
        onZoomChangeRef.current = onZoomChange;
    }, [effectiveZoom, onZoomChange]);

    const jsonStatus = useMemo(() => {
        if (!langInfo.isJson || isBinary) return null;
        return formatJsonSafely(content);
    }, [langInfo.isJson, isBinary, content]);

    const activeFullText = useMemo(() => {
        if (langInfo.isJson && jsonPretty && jsonStatus?.valid && jsonStatus.formatted !== undefined) {
            return jsonStatus.formatted;
        }
        return content;
    }, [langInfo.isJson, jsonPretty, jsonStatus, content]);

    const allRawLines = useMemo(() => activeFullText.split(/\r?\n/), [activeFullText]);
    const totalLineCount = allRawLines.length;
    const isTooLargeForFullLoad = activeFullText.length > MAX_EXPANDABLE_CHARS;

    const { displayText, isTruncated, shownLineCount } = useMemo(() => {
        if (showAllLines && !isTooLargeForFullLoad) {
            return {
                displayText: activeFullText,
                isTruncated: false,
                shownLineCount: totalLineCount,
            };
        }

        if (totalLineCount <= MAX_INITIAL_LINES && activeFullText.length <= MAX_INITIAL_CHARS) {
            return {
                displayText: activeFullText,
                isTruncated: false,
                shownLineCount: totalLineCount,
            };
        }

        const slicedLines: string[] = [];
        let charCount = 0;
        for (let i = 0; i < Math.min(totalLineCount, MAX_INITIAL_LINES); i++) {
            const nextLine = allRawLines[i];
            if (charCount + nextLine.length > MAX_INITIAL_CHARS && slicedLines.length > 0) break;
            slicedLines.push(nextLine);
            charCount += nextLine.length + 1;
        }
        return {
            displayText: slicedLines.join('\n'),
            isTruncated: true,
            shownLineCount: slicedLines.length,
        };
    }, [showAllLines, isTooLargeForFullLoad, activeFullText, totalLineCount, allRawLines]);

    const highlightedLines = useMemo(() => {
        if (isBinary || viewMode !== 'code') return [];
        return highlightCodeLines(displayText, langInfo);
    }, [isBinary, viewMode, displayText, langInfo]);

    const { linesWithSearch, totalMatches } = useMemo(() => {
        if (viewMode !== 'code' || !highlightedLines.length) {
            return { linesWithSearch: [], totalMatches: 0 };
        }
        const trimmed = findQuery.trim().toLowerCase();
        if (!trimmed) {
            return { linesWithSearch: highlightedLines, totalMatches: 0 };
        }
        const counter = { count: 0 };
        const processed = highlightedLines.map((lineHtml) =>
            applySearchHighlightToLineHtml(lineHtml, trimmed, activeMatchIdx, counter)
        );
        return { linesWithSearch: processed, totalMatches: counter.count };
    }, [viewMode, highlightedLines, findQuery, activeMatchIdx]);

    const renderedMarkdownHtml = useMemo(() => {
        if (!langInfo.isMarkdown || viewMode !== 'rendered' || isBinary) return '';
        return renderMarkdownHtml(displayText);
    }, [langInfo.isMarkdown, viewMode, isBinary, displayText]);

    // Ctrl+F shortcut to open in-file search while previewing
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                setViewMode('code');
                setShowFind(true);
                setTimeout(() => findInputRef.current?.focus(), 40);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Scroll active match cleanly into view
    useEffect(() => {
        if (totalMatches === 0 || viewMode !== 'code') return;
        const container = scrollRef.current;
        if (!container) return;
        requestAnimationFrame(() => {
            const matchEl = container.querySelector<HTMLElement>(
                `mark.code-find-match[data-match-idx="${activeMatchIdx}"]`
            );
            matchEl?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        });
    }, [activeMatchIdx, totalMatches, findQuery, viewMode]);

    // Attach mobile 2-finger pinch-to-zoom, double-tap zoom, and Ctrl+Wheel zoom
    useEffect(() => {
        const scrollEl = scrollRef.current;
        if (!scrollEl || isBinary) return;

        const cleanupPinch = attachDocumentPinchZoom({
            target: scrollEl,
            scrollEl,
            getContentEl: () => scaleWrapRef.current,
            getScale: () => zoomRef.current,
            minScale: MIN_CODE_ZOOM,
            maxScale: MAX_CODE_ZOOM,
            onLivePinch: (ratio, meta) => {
                setPinchMeta({
                    ratio,
                    dx: meta?.dx || 0,
                    dy: meta?.dy || 0,
                    originX: meta?.originX || 0,
                    originY: meta?.originY || 0,
                });
            },
            onCommitScale: (next) => onZoomChangeRef.current(next),
            onDoubleTap: (clientX, clientY) => {
                const cur = zoomRef.current;
                const targetScale = cur > 1.25 ? 1 : 1.75;
                const rect = scrollEl.getBoundingClientRect();
                const offsetX = clientX - rect.left;
                const offsetY = clientY - rect.top;
                const oldLeft = scrollEl.scrollLeft;
                const oldTop = scrollEl.scrollTop;
                const factor = targetScale / (cur || 1);
                onZoomChangeRef.current(targetScale);
                requestAnimationFrame(() => {
                    scrollEl.scrollLeft = Math.max(0, (oldLeft + offsetX) * factor - offsetX);
                    scrollEl.scrollTop = Math.max(0, (oldTop + offsetY) * factor - offsetY);
                });
            },
        });

        const handleWheel = (e: WheelEvent) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.15 : -0.15;
            const next = Math.max(
                MIN_CODE_ZOOM,
                Math.min(MAX_CODE_ZOOM, Number((zoomRef.current + delta).toFixed(2)))
            );
            onZoomChangeRef.current(next);
        };

        scrollEl.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            cleanupPinch();
            scrollEl.removeEventListener('wheel', handleWheel);
        };
    }, [isBinary, viewMode]);

    const handleCopyAll = useCallback(async () => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(activeFullText);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = activeFullText;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // Clipboard permission denied
        }
    }, [activeFullText]);

    const stepMatch = (delta: number) => {
        if (totalMatches <= 0) return;
        setActiveMatchIdx((prev) => (prev + delta + totalMatches) % totalMatches);
    };

    const isPinching = pinchMeta.ratio !== 1 || pinchMeta.dx !== 0 || pinchMeta.dy !== 0;

    return (
        <div
            className={`code-viewer-container theme-${editorTheme}`}
            data-lang={langInfo.id}
            style={{ '--lang-accent': langInfo.accentColor } as CSSProperties}
            onClick={(e) => {
                e.stopPropagation();
                onContainerClick?.();
            }}
        >
            <div className="code-viewer-toolbar">
                <div className="code-toolbar-left">
                    <span className="code-lang-badge" title={`${langInfo.label} (${langInfo.shortTag})`}>
                        <span className="code-lang-dot" />
                        <span className="code-lang-tag">{langInfo.shortTag}</span>
                        <span>{langInfo.label}</span>
                    </span>

                    <span className="code-meta-stats">
                        {totalLineCount.toLocaleString()} {totalLineCount === 1 ? 'line' : 'lines'}
                        {fileSize ? ` • ${formatByteSize(fileSize)}` : ''}
                    </span>

                    {jsonStatus && (
                        <span
                            className={`code-json-badge ${jsonStatus.valid ? 'valid' : 'invalid'}`}
                            title={jsonStatus.error || 'Valid JSON'}
                        >
                            {jsonStatus.valid ? 'Valid JSON' : 'Invalid JSON'}
                        </span>
                    )}

                    {langInfo.isMarkdown && (
                        <div className="code-mode-tabs">
                            <button
                                type="button"
                                className={`code-mode-tab ${viewMode === 'rendered' ? 'active' : ''}`}
                                onClick={() => setViewMode('rendered')}
                            >
                                Preview
                            </button>
                            <button
                                type="button"
                                className={`code-mode-tab ${viewMode === 'code' ? 'active' : ''}`}
                                onClick={() => setViewMode('code')}
                            >
                                Code
                            </button>
                        </div>
                    )}

                    {langInfo.isHtml && (
                        <div className="code-mode-tabs">
                            <button
                                type="button"
                                className={`code-mode-tab ${viewMode === 'code' ? 'active' : ''}`}
                                onClick={() => setViewMode('code')}
                            >
                                Code
                            </button>
                            <button
                                type="button"
                                className={`code-mode-tab ${viewMode === 'rendered' ? 'active' : ''}`}
                                onClick={() => setViewMode('rendered')}
                            >
                                Preview
                            </button>
                        </div>
                    )}

                    {langInfo.isJson && jsonStatus?.valid && (
                        <div className="code-mode-tabs">
                            <button
                                type="button"
                                className={`code-mode-tab ${jsonPretty ? 'active' : ''}`}
                                onClick={() => {
                                    setJsonPretty(true);
                                    setActiveMatchIdx(0);
                                }}
                            >
                                Formatted
                            </button>
                            <button
                                type="button"
                                className={`code-mode-tab ${!jsonPretty ? 'active' : ''}`}
                                onClick={() => {
                                    setJsonPretty(false);
                                    setActiveMatchIdx(0);
                                }}
                            >
                                Raw
                            </button>
                        </div>
                    )}
                </div>

                {!isBinary && (
                    <div className="code-toolbar-right">
                        {viewMode === 'code' && (
                            <>
                                <button
                                    type="button"
                                    className={`code-tool-btn ${showFind ? 'active' : ''}`}
                                    onClick={() => {
                                        const next = !showFind;
                                        setShowFind(next);
                                        if (next) setTimeout(() => findInputRef.current?.focus(), 40);
                                        else setFindQuery('');
                                    }}
                                    title="Find in file (Ctrl+F)"
                                >
                                    <FiSearch size={14} />
                                    <span>Find</span>
                                </button>
                                <button
                                    type="button"
                                    className={`code-tool-btn ${showLineNumbers ? 'active' : ''}`}
                                    onClick={() => setShowLineNumbers((v) => !v)}
                                    title="Toggle line numbers"
                                >
                                    <FiHash size={14} />
                                    <span>Lines</span>
                                </button>
                                <button
                                    type="button"
                                    className={`code-tool-btn ${wordWrap ? 'active' : ''}`}
                                    onClick={() => setWordWrap((v) => !v)}
                                    title="Toggle word wrap"
                                >
                                    <FiAlignLeft size={14} />
                                    <span>Wrap</span>
                                </button>
                            </>
                        )}

                        <button
                            type="button"
                            className="code-tool-btn"
                            onClick={() => setEditorTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                            title={editorTheme === 'dark' ? 'Switch to VS Code Light+' : 'Switch to VS Code Dark+'}
                        >
                            {editorTheme === 'dark' ? <FiSun size={14} /> : <FiMoon size={14} />}
                            <span>{editorTheme === 'dark' ? 'Light' : 'Dark'}</span>
                        </button>

                        <button
                            type="button"
                            className={`code-tool-btn ${copied ? 'active' : ''}`}
                            onClick={() => void handleCopyAll()}
                            title="Copy file contents"
                        >
                            {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
                            <span>{copied ? 'Copied' : 'Copy'}</span>
                        </button>
                    </div>
                )}
            </div>

            {showFind && viewMode === 'code' && !isBinary && (
                <div className="code-find-bar">
                    <input
                        ref={findInputRef}
                        type="text"
                        className="code-find-input"
                        placeholder="Find in file..."
                        value={findQuery}
                        onChange={(e) => {
                            setFindQuery(e.target.value);
                            setActiveMatchIdx(0);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                stepMatch(e.shiftKey ? -1 : 1);
                            } else if (e.key === 'Escape') {
                                setShowFind(false);
                                setFindQuery('');
                            }
                        }}
                    />
                    {findQuery.trim() && (
                        <span className="code-find-count">
                            {totalMatches > 0 ? `${activeMatchIdx + 1} / ${totalMatches}` : '0 matches'}
                        </span>
                    )}
                    <button
                        type="button"
                        className="code-tool-btn"
                        onClick={() => stepMatch(-1)}
                        disabled={totalMatches === 0}
                        title="Previous match (Shift+Enter)"
                    >
                        <FiChevronUp size={14} />
                    </button>
                    <button
                        type="button"
                        className="code-tool-btn"
                        onClick={() => stepMatch(1)}
                        disabled={totalMatches === 0}
                        title="Next match (Enter)"
                    >
                        <FiChevronDown size={14} />
                    </button>
                    <button
                        type="button"
                        className="code-tool-btn"
                        onClick={() => {
                            setShowFind(false);
                            setFindQuery('');
                        }}
                        title="Close search"
                    >
                        <FiX size={14} />
                    </button>
                </div>
            )}

            {isTruncated && !isBinary && (
                <div className="code-truncation-banner">
                    <span>
                        Showing first {shownLineCount.toLocaleString()} of {totalLineCount.toLocaleString()} lines for fast preview.
                    </span>
                    {!isTooLargeForFullLoad ? (
                        <button
                            type="button"
                            className="code-tool-btn"
                            onClick={() => setShowAllLines(true)}
                        >
                            <FiEye size={13} /> Load All
                        </button>
                    ) : (
                        onDownload && (
                            <button type="button" className="code-tool-btn" onClick={onDownload}>
                                <FiDownload size={13} /> Download Full File
                            </button>
                        )
                    )}
                </div>
            )}

            {isBinary ? (
                <div className="code-scroll-area">
                    <div className="code-binary-warning">
                        <FiCode size={32} style={{ color: langInfo.accentColor, marginBottom: '12px' }} />
                        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Binary Content Detected</p>
                        <p style={{ margin: '0 0 18px', fontSize: '0.85rem', color: '#9ca3af' }}>
                            This file contains null bytes and cannot be safely rendered as text.
                        </p>
                        {onDownload && (
                            <button
                                type="button"
                                className="code-tool-btn active"
                                style={{ margin: '0 auto', padding: '7px 14px' }}
                                onClick={onDownload}
                            >
                                <FiDownload size={14} /> Download File
                            </button>
                        )}
                    </div>
                </div>
            ) : langInfo.isHtml && viewMode === 'rendered' ? (
                <iframe
                    className="code-html-iframe"
                    sandbox=""
                    srcDoc={content}
                    title={fileName}
                />
            ) : (
                <div ref={scrollRef} className="code-scroll-area">
                    <div
                        ref={scaleWrapRef}
                        className={`code-scale-wrap ${wordWrap ? 'wrap-enabled' : ''}`}
                        style={{
                            transform: isPinching
                                ? `translate(${pinchMeta.dx}px, ${pinchMeta.dy}px) scale(${pinchMeta.ratio})`
                                : undefined,
                            transformOrigin: isPinching
                                ? `${pinchMeta.originX}px ${pinchMeta.originY}px`
                                : 'top left',
                            transition: isPinching ? 'none' : undefined,
                        }}
                    >
                        {langInfo.isMarkdown && viewMode === 'rendered' ? (
                            <div
                                className="markdown-preview-body"
                                style={{ zoom: effectiveZoom } as CSSProperties}
                                dangerouslySetInnerHTML={{ __html: renderedMarkdownHtml }}
                            />
                        ) : (
                            <table
                                className="code-lines-table"
                                style={{ fontSize: `${Math.max(8, Math.round(13.5 * effectiveZoom * 10) / 10)}px` }}
                            >
                                <tbody>
                                    {linesWithSearch.map((lineHtml, idx) => (
                                        <tr key={idx} className="code-line-row">
                                            {showLineNumbers && (
                                                <td className="code-line-num" aria-hidden="true">
                                                    {idx + 1}
                                                </td>
                                            )}
                                            <td
                                                className="code-line-content"
                                                dangerouslySetInnerHTML={{ __html: lineHtml || '&nbsp;' }}
                                            />
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
