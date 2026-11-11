import { useState, useEffect, useRef, useMemo } from "react";
import { useBlocker } from "react-router-dom";
import { 
    FiFolder, FiFile, FiUpload, FiPlus, FiTrash2, FiEdit2, FiDownload, 
    FiChevronRight, FiChevronUp, FiChevronDown, FiHome, FiX, FiFileText, FiImage, FiArchive,
    FiGrid, FiList, FiCornerUpRight, FiMoreHorizontal, FiLoader,
    FiZoomIn, FiZoomOut, FiMaximize, FiMusic, FiVideo, FiShare2, FiUsers, FiUploadCloud
} from "react-icons/fi";
import { FaFileWord, FaFileExcel, FaFilePowerpoint, FaFileCsv, FaFilePdf } from "react-icons/fa";
import { 
    subscribeToFolders, subscribeToFiles, createFolder, renameFolder, deleteFolder, 
    uploadVaultFile, downloadVaultFile, renameVaultFile, deleteVaultFile,
    moveFolder, moveVaultFile, getFolderItemCount, updateFolderColor,
    getAllFolders, getFilesInFolder
} from "../services/fileService";
import type { VaultFolder, VaultFile } from "../services/fileService";
import { auth } from "../firebaseConfig";
import ConfirmDialog from "./ConfirmDialog";
import FolderPickerModal from "./FolderPickerModal";
import ShareModal from "./ShareModal";
import { useTaskToast } from "../context/TaskToastContext";
import {
    listShares,
    downloadSharedFile,
    removeShare,
    ensureSharingKeys,
} from "../services/shareService";
import type { SharedItem, SharedFileEntry, ShareableItem } from "../services/shareService";
import { useSubscription } from "../context/SubscriptionContext";
import { compressImage } from "../utils/imageCompressor";
import PDFEditor from "./PDFEditor";
import { attachDocumentPinchZoom, attachMediaPinchPan } from "../utils/pinchZoom";
import { renderAsync } from "docx-preview";
import * as XLSX from "xlsx";
import JSZip from "jszip";

const gradientColorsList = [
    { id: 'golden-sand', name: 'Golden Sand', start: '#fde68a', end: '#facc15' },
    { id: 'sunset-glow', name: 'Sunset Glow', start: '#fb7185', end: '#fb923c' },
    { id: 'neon-horizon', name: 'Neon Horizon', start: '#d946ef', end: '#06b6d4' },
    { id: 'mango-salsa', name: 'Mango Salsa', start: '#facc15', mid: '#f97316', end: '#ef4444' },
    { id: 'aurora-flare', name: 'Aurora Flare', start: '#2dd4bf', mid: '#3b82f6', end: '#9333ea' },
    { id: 'cherry-pop', name: 'Cherry Pop', start: '#f472b6', end: '#f43f5e' },
    { id: 'peach-silk', name: 'Peach Silk', start: '#ffedd5', end: '#fecdd3' },
    { id: 'mint-cloud', name: 'Mint Cloud', start: '#99f6e4', end: '#d9f99d' },
    { id: 'lavender-tea', name: 'Lavender Tea', start: '#f5d0fe', end: '#c7d2fe' },
    { id: 'arctic-ice', name: 'Arctic Ice', start: '#7dd3fc', end: '#a5b4fc' },
    { id: 'cyber-night', name: 'Cyber Night', start: '#0f172a', mid: '#581c87', end: '#0f172a' },
    { id: 'deep-ocean', name: 'Deep Ocean', start: '#2563eb', end: '#7c3aed' },
    { id: 'royal-velvet', name: 'Royal Velvet', start: '#7e22ce', end: '#a21caf' },
    { id: 'pine-forest', name: 'Pine Forest', start: '#047857', end: '#134e4a' },
    { id: 'steel-blade', name: 'Steel Blade', start: '#374151', end: '#111827' },
    { id: 'tropical-sunrise', name: 'Tropical Sunrise', start: '#ec4899', mid: '#ea8108', end: '#b81445' },
    { id: 'cosmic-rift', name: 'Cosmic Rift', start: '#dc2626', mid: '#9333ea', end: '#2563eb' },
    { id: 'synthwave', name: 'Synthwave', start: '#06b6d4', mid: '#d946ef', end: '#f97316' },
    { id: 'moss', name: 'Moss', start: '#70e000', mid: '#008000', end: '#007200' },
    { id: 'atasha', name: 'Atasha Purple', start: '#e0b1cb', mid: '#be95c4', end: '#9f86c0' }
];

const gradientColors = gradientColorsList.reduce((acc, c) => {
    acc[c.id] = c.mid 
        ? `linear-gradient(135deg, ${c.start} 0%, ${c.mid} 50%, ${c.end} 100%)`
        : `linear-gradient(135deg, ${c.start} 0%, ${c.end} 100%)`;
    return acc;
}, {} as Record<string, string>);

const MS_OFFICE_TYPES = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
];

const isOfficeFile = (type: string) => MS_OFFICE_TYPES.includes(type);
const isDocxFile = (type: string) =>
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    type === 'application/msword';
const isExcelFile = (type: string) =>
    type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    type === 'application/vnd.ms-excel';
const isPptxFile = (type: string) =>
    type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const isPreviewMediaZoomable = (sel: { file: VaultFile; pptxThumbnailUrl?: string }) =>
    sel.file.type.startsWith('image/') ||
    sel.file.type.startsWith('video/') ||
    (isPptxFile(sel.file.type) && Boolean(sel.pptxThumbnailUrl));

const isPreviewHeaderZoomSupported = (sel: { file: VaultFile; excelHtml?: string; pptxThumbnailUrl?: string }) => {
    const t = sel.file.type;
    if (t === 'application/pdf' || t.startsWith('audio/')) return false;
    if (
        isOfficeFile(t) &&
        !isDocxFile(t) &&
        !(isExcelFile(t) && sel.excelHtml) &&
        !(isPptxFile(t) && sel.pptxThumbnailUrl)
    ) {
        return false;
    }
    return true;
};

const resolveMimeType = (name: string, declaredType?: string): string => {
    const n = (name || "").toLowerCase();
    if (n.endsWith(".pdf")) return "application/pdf";
    if (n.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (n.endsWith(".doc")) return "application/msword";
    if (n.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    if (n.endsWith(".xls")) return "application/vnd.ms-excel";
    if (n.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (n.endsWith(".ppt")) return "application/vnd.ms-powerpoint";
    if (n.endsWith(".csv")) return "text/csv";
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
    if (n.endsWith(".png")) return "image/png";
    if (n.endsWith(".gif")) return "image/gif";
    if (n.endsWith(".webp")) return "image/webp";
    if (n.endsWith(".svg")) return "image/svg+xml";
    if (n.endsWith(".bmp")) return "image/bmp";
    if (n.endsWith(".mp4")) return "video/mp4";
    if (n.endsWith(".webm")) return "video/webm";
    if (n.endsWith(".mov")) return "video/quicktime";
    if (n.endsWith(".mp3")) return "audio/mpeg";
    if (n.endsWith(".wav")) return "audio/wav";
    if (n.endsWith(".ogg")) return "audio/ogg";
    if (n.endsWith(".txt")) return "text/plain";
    if (n.endsWith(".md")) return "text/markdown";
    if (declaredType && declaredType !== "application/octet-stream" && declaredType !== "") {
        return declaredType;
    }
    return declaredType || "application/octet-stream";
};

const formatDateModified = (val?: any): string => {
    if (!val) return "-";
    const d = val instanceof Date ? val : (val.toDate ? val.toDate() : new Date(val));
    if (isNaN(d.getTime())) return "-";
    const dateStr = d.toLocaleDateString();
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "pm" : "am";
    hours = hours % 12;
    hours = hours ? hours : 12;
    return `${dateStr} ${hours}:${minutes} ${ampm}`;
};

const getExtFromMime = (mime?: string): string => {
    if (!mime) return "";
    const m = mime.toLowerCase().trim();
    if (m === "application/pdf") return "pdf";
    if (m === "image/jpeg" || m === "image/jpg") return "jpg";
    if (m === "image/png") return "png";
    if (m === "image/gif") return "gif";
    if (m === "image/webp") return "webp";
    if (m === "image/svg+xml") return "svg";
    if (m === "image/bmp") return "bmp";
    if (m === "image/avif") return "avif";
    if (m === "video/mp4") return "mp4";
    if (m === "video/webm") return "webm";
    if (m === "video/quicktime") return "mov";
    if (m === "video/x-msvideo") return "avi";
    if (m === "video/x-matroska") return "mkv";
    if (m === "audio/mpeg" || m === "audio/mp3") return "mp3";
    if (m === "audio/wav") return "wav";
    if (m === "audio/ogg") return "ogg";
    if (m === "audio/flac") return "flac";
    if (m === "audio/x-m4a" || m === "audio/m4a") return "m4a";
    if (m === "application/zip" || m === "application/x-zip-compressed") return "zip";
    if (m === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
    if (m === "application/msword") return "doc";
    if (m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx";
    if (m === "application/vnd.ms-excel") return "xls";
    if (m === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx";
    if (m === "application/vnd.ms-powerpoint") return "ppt";
    if (m === "text/csv") return "csv";
    if (m === "text/plain") return "txt";
    if (m === "text/markdown") return "md";
    if (m === "text/html") return "html";
    if (m === "text/css") return "css";
    if (m === "application/json") return "json";
    if (m.startsWith("image/")) return m.replace("image/", "").split(";")[0].replace("x-", "");
    if (m.startsWith("video/")) return m.replace("video/", "").split(";")[0].replace("x-", "");
    if (m.startsWith("audio/")) return m.replace("audio/", "").split(";")[0].replace("x-", "");
    return "";
};

const isImageFile = (name?: string, mimeType?: string, path?: string): boolean => {
    if (mimeType && mimeType.toLowerCase().startsWith("image/")) return true;
    const candidates = [name || "", path || ""];
    return candidates.some(str => /\.(jpg|jpeg|png|gif|webp|bmp|svg|avif|ico|tiff?)$/i.test(str));
};

const getFileTypeLabel = (name: string, isFolder: boolean, mimeType?: string): string => {
    if (isFolder) return "File folder";
    const n = (name || "").toLowerCase();
    let ext = n.includes(".") ? n.split(".").pop() || "" : "";
    if (!ext && mimeType) {
        ext = getExtFromMime(mimeType);
    }
    ext = ext.toLowerCase();

    switch (ext) {
        case "pdf": return "PDF Document";
        case "docx": 
        case "doc": return "Microsoft Word Document";
        case "xlsx":
        case "xls": return "Microsoft Excel Worksheet";
        case "pptx":
        case "ppt": return "Microsoft PowerPoint Presentation";
        case "csv": return "CSV Document";
        case "txt": return "Text Document";
        case "md": return "Markdown Document";
        case "json": return "JSON File";
        case "js":
        case "mjs":
        case "cjs": return "JavaScript File";
        case "jsx": return "JSX File";
        case "ts": return "TypeScript File";
        case "tsx": return "TSX File";
        case "py":
        case "pyw": return "Python File";
        case "html":
        case "htm": return "HTML Document";
        case "css": return "CSS File";
        case "xml": return "XML Document";
        case "sql": return "SQL File";
        case "sh": return "Shell Script";
        case "bat":
        case "cmd": return "Windows Batch File";
        case "png": return "PNG image";
        case "jpg":
        case "jpeg": return "JPG image";
        case "gif": return "GIF image";
        case "webp": return "WebP image";
        case "svg": return "SVG image";
        case "bmp": return "Bitmap image";
        case "mp4": return "MP4 video";
        case "mov": return "QuickTime video";
        case "avi": return "AVI video";
        case "mkv": return "MKV video";
        case "webm": return "WEBM video";
        case "mp3": return "MP3 audio";
        case "wav": return "WAV audio";
        case "ogg": return "OGG audio";
        case "m4a": return "M4A audio";
        case "flac": return "FLAC audio";
        case "zip": return "Compressed (zipped) Folder";
        case "rar": return "RAR archive";
        case "7z": return "7Z archive";
        case "tar": return "TAR archive";
        case "gz": return "GZ archive";
        case "exe": return "Application";
    }

    if (ext) {
        return `${ext.toUpperCase()} File`;
    }

    if (mimeType) {
        const subtype = mimeType.split("/")[1]?.split(";")[0]?.replace("x-", "")?.toUpperCase();
        if (subtype) return `${subtype} File`;
    }

    return "File";
};

const globalImageCache = new Map<string, string>();

const ImageThumbnail = ({ file }: { file: VaultFile }) => {
    const [url, setUrl] = useState<string | null>(globalImageCache.get(file.id) || null);
    const [loading, setLoading] = useState<boolean>(!globalImageCache.has(file.id));

    useEffect(() => {
        if (!isImageFile(file.name, file.type)) {
            setLoading(false);
            return;
        }
        if (globalImageCache.has(file.id)) {
            setUrl(globalImageCache.get(file.id)!);
            setLoading(false);
            return;
        }
        let isMounted = true;
        setLoading(true);
        downloadVaultFile(file).then(blob => {
            if (isMounted) {
                const objectUrl = URL.createObjectURL(blob);
                globalImageCache.set(file.id, objectUrl);
                setUrl(objectUrl);
                setLoading(false);
            }
        }).catch(err => {
            console.error("Failed to load thumbnail", err);
            if (isMounted) setLoading(false);
        });
        return () => {
            isMounted = false;
        };
    }, [file.id]);

    if (loading) {
        return <FiLoader size={16} className="spin" style={{ color: "var(--accent)" }} />;
    }

    if (!url) {
        return <FiImage size={18} style={{ color: "#4caf50" }} />;
    }

    return (
        <img src={url} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
    );
};

const SharedImageThumbnail = ({ share, fileEntry }: { share: SharedItem; fileEntry?: SharedFileEntry }) => {
    const entry = fileEntry || share.files?.[0];
    const storagePath = entry?.storagePath || "";
    const cacheKey = `${share.id}:${storagePath}`;
    const [url, setUrl] = useState<string | null>(globalImageCache.get(cacheKey) || null);
    const [loading, setLoading] = useState<boolean>(!globalImageCache.has(cacheKey));

    useEffect(() => {
        if (!entry || !isImageFile(share.name, entry.type, entry.path)) {
            setLoading(false);
            return;
        }
        if (globalImageCache.has(cacheKey)) {
            setUrl(globalImageCache.get(cacheKey)!);
            setLoading(false);
            return;
        }
        let isMounted = true;
        setLoading(true);
        downloadSharedFile(share, entry).then(blob => {
            if (isMounted) {
                const objectUrl = URL.createObjectURL(blob);
                globalImageCache.set(cacheKey, objectUrl);
                setUrl(objectUrl);
                setLoading(false);
            }
        }).catch(err => {
            console.error("Failed to load shared thumbnail", err);
            if (isMounted) setLoading(false);
        });
        return () => {
            isMounted = false;
        };
    }, [cacheKey]);

    if (loading) {
        return <FiLoader size={16} className="spin" style={{ color: "var(--accent)" }} />;
    }

    if (!url) {
        return <FiImage size={18} style={{ color: "#4caf50" }} />;
    }

    return (
        <img src={url} alt={entry?.path || share.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
    );
};

const globalFolderCountsCache: Record<string, number> = {};
let globalFoldersCache: VaultFolder[] | null = null;
let globalFilesCache: VaultFile[] | null = null;

function sanitizeExcelHtml(html: string): string {
    if (!html) return '';
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        doc.querySelectorAll('script, iframe, object, embed, link, meta, base').forEach(el => el.remove());
        doc.querySelectorAll('*').forEach(el => {
            for (const attr of Array.from(el.attributes)) {
                const name = attr.name.toLowerCase();
                const val = attr.value.toLowerCase().trim();
                if (name.startsWith('on') || val.startsWith('javascript:') || val.startsWith('data:text/html')) {
                    el.removeAttribute(attr.name);
                }
            }
        });
        const table = doc.querySelector('table');
        return table ? table.outerHTML : (doc.body ? doc.body.innerHTML : '');
    } catch {
        return '';
    }
}

export function clearFileExplorerCache(): void {
    globalImageCache.forEach((url) => {
        try {
            URL.revokeObjectURL(url);
        } catch {}
    });
    globalImageCache.clear();
    for (const k in globalFolderCountsCache) {
        delete globalFolderCountsCache[k];
    }
    globalFoldersCache = null;
    globalFilesCache = null;
}

export default function FileExplorer() {
    const { startTask, updateTask, finishTask, dismissTask } = useTaskToast();
    const { storageUsed, storageLimit, isStorageAtLimit, isPro } = useSubscription();
    
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<{id: string | null, name: string}[]>([{ id: null, name: "Home" }]);
    
    const [folders, setFolders] = useState<VaultFolder[]>(() => globalFoldersCache ?? []);
    const [files, setFiles] = useState<VaultFile[]>(() => globalFilesCache ?? []);
    const [loading, setLoading] = useState(() => !globalFoldersCache);
    const [actionLoading, setActionLoading] = useState(false);
    const [loadingBulkAction, setLoadingBulkAction] = useState<string | null>(null);

    // Modals
    const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [downloadPromptFile, setDownloadPromptFile] = useState<VaultFile | null>(null);
    const [renameTarget, setRenameTarget] = useState<{id: string, name: string, isFolder: boolean, sharedItem?: SharedItem, sharedFileEntry?: SharedFileEntry} | null>(null);
    const [newName, setNewName] = useState("");

    const [deleteTarget, setDeleteTarget] = useState<{id: string, name: string, isFolder: boolean, file?: VaultFile} | null>(null);
    const [moveTarget, setMoveTarget] = useState<{id: string, name: string, isFolder: boolean, sharedItem?: SharedItem, sharedFileEntry?: SharedFileEntry} | null>(null);

    // View Mode
    const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
        return (localStorage.getItem("fs_view_mode") as "grid" | "list") || "grid";
    });

    useEffect(() => {
        localStorage.setItem("fs_view_mode", viewMode);
    }, [viewMode]);

    // Sort state
    const [sortBy, setSortBy] = useState<"name" | "date" | "type" | "size">("name");
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

    const handleSort = (column: "name" | "date" | "type" | "size") => {
        if (sortBy === column) {
            setSortOrder(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortBy(column);
            setSortOrder(column === "date" ? "desc" : "asc");
        }
    };

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        target: { id: string, name: string, isFolder: boolean, file?: VaultFile, sharedItem?: SharedItem, sharedFileEntry?: SharedFileEntry };
    } | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Uploading state
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [duplicatePrompt, setDuplicatePrompt] = useState<{
        fileName: string;
        resolve: (action: 'replace' | 'keep' | 'skip') => void;
    } | null>(null);

    const askDuplicateAction = (fileName: string): Promise<'replace' | 'keep' | 'skip'> => {
        return new Promise((resolve) => {
            setDuplicatePrompt({ fileName, resolve });
        });
    };

    // Image Viewer
    const [selectedImage, setSelectedImage] = useState<{ 
        file: VaultFile; 
        url: string; 
        pdfData?: Uint8Array; 
        officeData?: ArrayBuffer; 
        excelHtml?: string; 
        pptxThumbnailUrl?: string;
        sharedItem?: SharedItem;
        sharedFileEntry?: SharedFileEntry;
    } | null>(null);
    const officeContainerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [imageCache, setImageCache] = useState<Record<string, string>>({});
    const [officeDataCache, setOfficeDataCache] = useState<Record<string, { arrayBuffer?: ArrayBuffer, excelHtml?: string, pptxThumbnailUrl?: string }>>({});
    const [imageMenuOpen, setImageMenuOpen] = useState(false);
    const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
    const [loadingColor, setLoadingColor] = useState<string | null>(null);
    const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
    const [colorPickerTarget, setColorPickerTarget] = useState<{ id: string, name: string, sharedItem?: SharedItem } | null>(null);
    const [sharedFolderColors, setSharedFolderColors] = useState<Record<string, string>>(() => {
        try {
            return JSON.parse(localStorage.getItem(`shared_folder_colors_${auth.currentUser?.uid}`) || "{}");
        } catch {
            return {};
        }
    });

    // Bulk Actions
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
    const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
    const [bulkMoveModalOpen, setBulkMoveModalOpen] = useState(false);
    const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
    const [bulkMoveSharedModalOpen, setBulkMoveSharedModalOpen] = useState(false);

    // Sharing State
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [itemsToShare, setItemsToShare] = useState<ShareableItem[]>([]);
    const [sharedItems, setSharedItems] = useState<SharedItem[]>([]);
    const [loadingShares, setLoadingShares] = useState(false);
    const [selectedSharedIds, setSelectedSharedIds] = useState<Set<string>>(new Set());
    const [confirmRemoveShare, setConfirmRemoveShare] = useState<SharedItem | null>(null);
    const [downloadingSharedId, setDownloadingSharedId] = useState<string | null>(null);

    const refreshShares = async () => {
        setLoadingShares(true);
        try {
            await ensureSharingKeys();
            const res = await listShares();
            const customNames = JSON.parse(localStorage.getItem(`shared_custom_names_${auth.currentUser?.uid}`) || "{}");
            const applyCustomNames = (list: SharedItem[]) => list.map(s => customNames[s.id] ? { ...s, name: customNames[s.id] } : s);
            setSharedItems(applyCustomNames(res.received));
            if (typeof window !== "undefined") {
                window.dispatchEvent(new CustomEvent("shared-files-updated"));
            }
        } catch (err) {
            console.debug("Failed to list shares:", err);
        } finally {
            setLoadingShares(false);
        }
    };

    useEffect(() => {
        void refreshShares();
    }, []);

    // Zoom and Pan State
    const [zoomLevel, setZoomLevel] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [isTouchInteracting, setIsTouchInteracting] = useState(false);
    const [docPinchScale, setDocPinchScale] = useState(1);
    const lastPanPos = useRef({ x: 0, y: 0 });
    const lastDragTime = useRef(0);
    const imageRef = useRef<HTMLDivElement>(null);
    const zoomRef = useRef(zoomLevel);
    zoomRef.current = zoomLevel;
    const panRef = useRef(pan);
    panRef.current = pan;
    const activeIframeRef = useRef<HTMLIFrameElement | null>(null);
    const iframeCleanupRef = useRef<(() => void) | null>(null);

    // Block navigation during upload
    useBlocker(uploadProgress !== null);

    // ── Drag & drop upload (Google Drive style) ──
    // Window-level listeners so a file dropped ANYWHERE on the page is uploaded
    // to the folder currently being viewed.
    const [isDragOver, setIsDragOver] = useState(false);
    const dragDepth = useRef(0);
    const dropEnabledRef = useRef(true);
    const dropHandlerRef = useRef<(files: File[]) => void>(() => {});

    useEffect(() => {
        const hasFiles = (e: DragEvent) =>
            !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");

        const onDragEnter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth.current++;
            if (dropEnabledRef.current) setIsDragOver(true);
        };

        const onDragOver = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            // Must preventDefault or the browser will not fire "drop" (and would open the file)
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = dropEnabledRef.current ? "copy" : "none";
        };

        const onDragLeave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setIsDragOver(false);
        };

        const onDrop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            dragDepth.current = 0;
            setIsDragOver(false);
            if (!dropEnabledRef.current) return;

            // Collect files synchronously (DataTransfer is cleared after the handler returns)
            const dropped: File[] = [];
            let skippedFolder = false;
            const items = e.dataTransfer?.items;
            if (items && items.length > 0) {
                for (const item of Array.from(items)) {
                    if (item.kind !== "file") continue;
                    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => { isDirectory: boolean } | null }).webkitGetAsEntry?.();
                    if (entry?.isDirectory) {
                        skippedFolder = true;
                        continue;
                    }
                    const f = item.getAsFile();
                    if (f) dropped.push(f);
                }
            } else if (e.dataTransfer?.files) {
                dropped.push(...Array.from(e.dataTransfer.files));
            }

            if (dropped.length === 0) {
                if (skippedFolder) alert("Folders can't be uploaded by drag and drop yet. Please drop individual files.");
                return;
            }
            dropHandlerRef.current(dropped);
        };

        const reset = () => {
            dragDepth.current = 0;
            setIsDragOver(false);
        };

        window.addEventListener("dragenter", onDragEnter);
        window.addEventListener("dragover", onDragOver);
        window.addEventListener("dragleave", onDragLeave);
        window.addEventListener("drop", onDrop);
        window.addEventListener("dragend", reset);
        return () => {
            window.removeEventListener("dragenter", onDragEnter);
            window.removeEventListener("dragover", onDragOver);
            window.removeEventListener("dragleave", onDragLeave);
            window.removeEventListener("drop", onDrop);
            window.removeEventListener("dragend", reset);
        };
    }, []);

    useEffect(() => {
        const handleResize = () => {
            setPan(prev => {
                const el = imageRef.current;
                if (!el) return prev;
                const z = zoomRef.current;
                if (z <= 1) return { x: 0, y: 0 };
                const rect = el.getBoundingClientRect();
                const boundaryMult = z - 1;
                const w = rect.width;
                const h = rect.height;
                const maxDragX = w * boundaryMult + window.innerWidth / 2;
                const maxDragY = h * boundaryMult + window.innerHeight / 2;

                if (Math.abs(prev.x) >= maxDragX - 5 || Math.abs(prev.y) >= maxDragY - 5) {
                    return { x: 0, y: 0 };
                }
                return prev;
            });
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [selectedImage]);

    useEffect(() => {
        if (scrollContainerRef.current) {
            const el = scrollContainerRef.current;
            if (el.scrollWidth > el.clientWidth) {
                el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
            }
        }
    }, [selectedImage]);

    // Attach mobile 2-finger pinch-to-zoom & pan for media previews (images, PPTX slides, video)
    useEffect(() => {
        if (!selectedImage || !isPreviewMediaZoomable(selectedImage) || !imageRef.current) return;
        return attachMediaPinchPan({
            el: imageRef.current,
            getZoom: () => zoomRef.current,
            getPan: () => panRef.current,
            minZoom: 0.5,
            maxZoom: 5,
            onUpdate: (nextZoom, nextPan, interacting) => {
                setZoomLevel(nextZoom);
                setPan(nextPan);
                setIsTouchInteracting(interacting);
            },
        });
    }, [selectedImage]);

    // Attach mobile 2-finger pinch-to-zoom for scrollable Office documents (Word DOCX, Excel XLSX)
    useEffect(() => {
        setDocPinchScale(1);
        if (!selectedImage) {
            if (iframeCleanupRef.current) {
                iframeCleanupRef.current();
                iframeCleanupRef.current = null;
            }
            activeIframeRef.current = null;
            return;
        }
        const t = selectedImage.file.type;
        const isScrollDoc = isDocxFile(t) || (isExcelFile(t) && Boolean(selectedImage.excelHtml));
        if (!isScrollDoc || !scrollContainerRef.current) return;

        const el = scrollContainerRef.current;
        return attachDocumentPinchZoom({
            target: el,
            scrollEl: el,
            getScale: () => zoomRef.current,
            minScale: 0.35,
            maxScale: 4,
            onLivePinch: setDocPinchScale,
            onCommitScale: (next) => setZoomLevel(next),
        });
    }, [selectedImage]);

    // Sync header zoom buttons with active iframe preview (text / html / code)
    useEffect(() => {
        try {
            const doc = activeIframeRef.current?.contentDocument;
            if (doc?.documentElement) {
                (doc.documentElement.style as any).zoom = String(zoomLevel);
            }
        } catch {
            // Ignore cross-origin sandbox restrictions
        }
    }, [zoomLevel]);

    const attachIframePinch = (iframe: HTMLIFrameElement) => {
        activeIframeRef.current = iframe;
        if (iframeCleanupRef.current) {
            iframeCleanupRef.current();
            iframeCleanupRef.current = null;
        }
        try {
            const doc = iframe.contentDocument;
            if (!doc || !doc.documentElement) return;
            const scrollTarget = (doc.scrollingElement as HTMLElement) || doc.documentElement;
            doc.documentElement.style.touchAction = 'pan-x pan-y';
            (doc.documentElement.style as any).zoom = String(zoomRef.current);

            iframeCleanupRef.current = attachDocumentPinchZoom({
                target: doc,
                scrollEl: scrollTarget,
                getScale: () => zoomRef.current,
                minScale: 0.4,
                maxScale: 4,
                onLivePinch: (ratio) => {
                    const targetEl = doc.body || doc.documentElement;
                    if (ratio === 1) {
                        targetEl.style.transform = '';
                        targetEl.style.transformOrigin = '';
                    } else {
                        targetEl.style.transform = `scale(${ratio})`;
                        targetEl.style.transformOrigin = 'top left';
                    }
                },
                onCommitScale: (next) => setZoomLevel(next),
            });
        } catch {
            // Fallback gracefully if contentDocument is inaccessible
        }
    };

    // Render docx files when officeContainerRef is available
    useEffect(() => {
        if (
            selectedImage &&
            selectedImage.officeData &&
            isDocxFile(selectedImage.file.type) &&
            officeContainerRef.current
        ) {
            officeContainerRef.current.innerHTML = '';
            renderAsync(selectedImage.officeData, officeContainerRef.current, undefined, {
                inWrapper: true,
                ignoreWidth: false,
                ignoreHeight: false,
                breakPages: true,
                ignoreLastRenderedPageBreak: false,
            }).catch((err: unknown) => console.error('Failed to render docx', err));
        }
    }, [selectedImage]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (uploadProgress !== null) {
                e.preventDefault();
                e.returnValue = "";
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [uploadProgress]);

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    useEffect(() => {
        if (currentFolderId?.startsWith("__shared__")) {
            setFolders([]);
            setFiles([]);
            setLoading(false);
            void refreshShares();
            return;
        }

        setLoading(true);
        let foldersLoaded = false;
        let filesLoaded = false;
        const markLoaded = () => {
            if (foldersLoaded && filesLoaded) {
                setLoading(false);
            }
        };

        const unsubFolders = subscribeToFolders(currentFolderId, async (fetchedFolders) => {
            if (currentFolderId === null) globalFoldersCache = fetchedFolders;
            setFolders(fetchedFolders);
            foldersLoaded = true;
            markLoaded();
            
            // Eagerly populate from cache so we don't show "Loading..."
            const initialCounts: Record<string, number> = {};
            fetchedFolders.forEach(f => {
                if (globalFolderCountsCache[f.id] !== undefined) {
                    initialCounts[f.id] = globalFolderCountsCache[f.id];
                }
            });
            if (Object.keys(initialCounts).length > 0) {
                setFolderCounts(prev => ({ ...prev, ...initialCounts }));
            }
            
            const counts: Record<string, number> = {};
            await Promise.all(fetchedFolders.map(async f => {
                const count = await getFolderItemCount(f.id);
                counts[f.id] = count;
                globalFolderCountsCache[f.id] = count;
            }));
            setFolderCounts(prev => ({ ...prev, ...counts }));
        });

        const unsubFiles = subscribeToFiles(currentFolderId, (fetchedFiles) => {
            if (currentFolderId === null) globalFilesCache = fetchedFiles;
            setFiles(fetchedFiles);
            filesLoaded = true;
            markLoaded();
        });

        return () => {
            unsubFolders();
            unsubFiles();
        };
    }, [currentFolderId]);

    const navigateToFolder = (folderId: string | null, folderName: string) => {
        setCurrentFolderId(folderId);
        setSelectedFiles(new Set());
        setSelectedFolders(new Set());
        setSelectedSharedIds(new Set());
        if (folderId === null) {
            setBreadcrumbs([{ id: null, name: "Home" }]);
        } else {
            // Check if it's already in breadcrumbs to navigate backwards
            const index = breadcrumbs.findIndex(b => b.id === folderId);
            if (index !== -1) {
                setBreadcrumbs(breadcrumbs.slice(0, index + 1));
            } else {
                setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }]);
            }
        }
    };

    const handleCreateFolder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newFolderName.trim()) return;
        setActionLoading(true);
        try {
            await createFolder(newFolderName.trim(), currentFolderId);
            setNewFolderModalOpen(false);
            setNewFolderName("");

        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const getExtension = (name: string) => {
        const lastDot = name.lastIndexOf('.');
        return lastDot !== -1 ? name.substring(lastDot) : '';
    };

    const getNameWithoutExtension = (name: string) => {
        const lastDot = name.lastIndexOf('.');
        return lastDot !== -1 ? name.substring(0, lastDot) : name;
    };

    const handleRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!renameTarget || !newName.trim()) return;
        setActionLoading(true);
        try {
            let finalName = newName.trim();
            if (renameTarget.sharedItem) {
                const shareId = renameTarget.sharedItem.id;
                if (!renameTarget.isFolder && !renameTarget.sharedFileEntry) {
                    const ext = getExtension(renameTarget.name);
                    if (finalName.endsWith(ext) && ext !== '') {
                        finalName = finalName.slice(0, -ext.length);
                    }
                    finalName = finalName + ext;
                }
                const customNames = JSON.parse(localStorage.getItem(`shared_custom_names_${auth.currentUser?.uid}`) || "{}");
                customNames[shareId] = finalName;
                localStorage.setItem(`shared_custom_names_${auth.currentUser?.uid}`, JSON.stringify(customNames));
                setSharedItems(prev => prev.map(s => s.id === shareId ? { ...s, name: finalName } : s));
            } else if (renameTarget.isFolder) {
                await renameFolder(renameTarget.id, finalName);
            } else {
                const ext = getExtension(renameTarget.name);
                // Ensure they didn't manually type the extension to avoid .pdf.pdf
                if (finalName.endsWith(ext) && ext !== '') {
                    finalName = finalName.slice(0, -ext.length);
                }
                finalName = finalName + ext;
                
                await renameVaultFile(renameTarget.id, finalName);
            }
            setRenameModalOpen(false);
            setRenameTarget(null);
            setNewName("");

            setSelectedImage(prev => {
                if (!prev) return null;
                const matches = prev.file.id === renameTarget.id || 
                    (renameTarget.sharedItem && prev.sharedItem?.id === renameTarget.sharedItem.id);
                return matches ? { ...prev, file: { ...prev.file, name: finalName } } : prev;
            });
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        const target = deleteTarget;
        setActionLoading(true);
        const taskId = startTask({ title: `Deleting "${target.name}"`, detail: target.isFolder ? "Removing folder and its contents…" : "Removing file…" });
        try {
            if (target.isFolder) {
                await deleteFolder(target.id);
            } else if (target.file) {
                await deleteVaultFile(target.file);
            }
            setDeleteTarget(null);

            setSelectedImage(prev => prev && prev.file.id === target.id ? null : prev);
            finishTask(taskId, { status: "success", title: `Deleted "${target.name}"` });
        } catch (err) {
            console.error(err);
            finishTask(taskId, { status: "error", title: `Couldn't delete "${target.name}"`, detail: "Something went wrong. Please try again." });
        } finally {
            setActionLoading(false);
        }
    };

    const handleMove = async (destinationFolderId: string | null) => {
        if (!moveTarget) return;
        const target = moveTarget;
        setActionLoading(true);
        const taskId = startTask({ title: `Moving "${target.name}"`, detail: "Moving to the selected folder…" });
        try {
            if (target.sharedItem) {
                const share = target.sharedItem;
                const fileEntry = target.sharedFileEntry;
                if (fileEntry) {
                    const blob = await downloadSharedFile(share, fileEntry);
                    const fileObj = new File([blob], fileEntry.name, { type: fileEntry.type });
                    await uploadVaultFile(fileObj, destinationFolderId);
                } else if (share.itemType === "file" && share.files[0]) {
                    const blob = await downloadSharedFile(share, share.files[0]);
                    const fileObj = new File([blob], share.name, { type: share.files[0].type });
                    await uploadVaultFile(fileObj, destinationFolderId);
                    if (!share.isSender) {
                        await removeShare(share.id);
                        await refreshShares();
                    }
                } else {
                    const newFolderId = await createFolder(share.name, destinationFolderId);
                    for (const f of share.files) {
                        const blob = await downloadSharedFile(share, f);
                        const fileObj = new File([blob], f.name, { type: f.type });
                        await uploadVaultFile(fileObj, newFolderId);
                    }
                    if (!share.isSender) {
                        await removeShare(share.id);
                        await refreshShares();
                    }
                }
            } else if (target.isFolder) {
                await moveFolder(target.id, destinationFolderId);
            } else {
                await moveVaultFile(target.id, destinationFolderId);
            }
            setMoveTarget(null);

            setSelectedImage(prev => {
                if (!prev) return null;
                const matches = prev.file.id === target.id || 
                    Boolean(target.sharedItem && prev.sharedItem?.id === target.sharedItem.id);
                return matches ? null : prev;
            });
            finishTask(taskId, { status: "success", title: `Moved "${target.name}"` });
        } catch (err) {
            console.error(err);
            finishTask(taskId, { status: "error", title: `Couldn't move "${target.name}"`, detail: "Something went wrong. Please try again." });
        } finally {
            setActionLoading(false);
        }
    };

    const handleColorChange = async (color: string) => {
        if (!colorPickerTarget) return;
        setLoadingColor(color || "reset");
        try {
            if (colorPickerTarget.sharedItem) {
                const colors = JSON.parse(localStorage.getItem(`shared_folder_colors_${auth.currentUser?.uid}`) || "{}");
                colors[colorPickerTarget.sharedItem.id] = color;
                localStorage.setItem(`shared_folder_colors_${auth.currentUser?.uid}`, JSON.stringify(colors));
                setSharedFolderColors(colors);
            } else {
                await updateFolderColor(colorPickerTarget.id, color);
            }
            setColorPickerTarget(null);

        } catch (err) {
            console.error(err);
            alert("Failed to update color.");
        } finally {
            setLoadingColor(null);
        }
    };

    const openContextMenu = (clientX: number, clientY: number, target: { id: string, name: string, isFolder: boolean, file?: VaultFile, sharedItem?: SharedItem, sharedFileEntry?: SharedFileEntry }) => {
        let x = clientX;
        let y = clientY;

        // Context menu is ~160px wide and ~200px tall
        if (x + 170 > window.innerWidth) x = window.innerWidth - 180;
        if (y + 210 > window.innerHeight) y = window.innerHeight - 220;

        setContextMenu({ x, y, target });
    };

    const handleContextMenu = (e: React.MouseEvent, target: { id: string, name: string, isFolder: boolean, file?: VaultFile, sharedItem?: SharedItem, sharedFileEntry?: SharedFileEntry }) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, target);
    };

    const handleTouchStart = (e: React.TouchEvent, target: { id: string, name: string, isFolder: boolean, file?: VaultFile, sharedItem?: SharedItem, sharedFileEntry?: SharedFileEntry }) => {
        const touch = e.touches[0];
        longPressTimer.current = setTimeout(() => {
            openContextMenu(touch.clientX, touch.clientY, target);
        }, 500); // 500ms for long press
    };

    const handleTouchEnd = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };

    const handleTouchMove = () => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const uploadFileList = async (uploadFiles: File[]) => {
        if (uploadFiles.length === 0) return;

        // Check file sizes
        for (const file of uploadFiles) {
            if (!isPro && file.size > 20 * 1024 * 1024) {
                alert(`File "${file.name}" is too large. Maximum size is 20MB per file for Free users. Upgrade to Pro for unlimited file size!`);
                if (fileInputRef.current) fileInputRef.current.value = "";
                return;
            }
        }

        // Check total storage space limit
        const totalSize = uploadFiles.reduce((sum, f) => sum + f.size, 0);
        if (storageUsed + totalSize > storageLimit) {
            alert("Not enough storage space for all files. Upgrade to Pro for more storage!");
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
        }

        const fileCount = uploadFiles.length;
        const taskId = startTask({
            title: fileCount === 1 ? `Uploading "${uploadFiles[0].name}"` : `Uploading ${fileCount} files`,
            detail: "Preparing…",
            progress: 0,
        });
        let uploadedCount = 0;
        let lastUploadedName = "";
        let stopMessage: string | null = null;

        try {
            let currentStorageUsed = storageUsed;
            let uploadedBytes = 0;
            setUploadProgress(0);
            
            for (let i = 0; i < uploadFiles.length; i++) {
                const file = uploadFiles[i];
                updateTask(taskId, {
                    detail: fileCount > 1 ? `File ${i + 1} of ${fileCount} · ${file.name}` : "Encrypting and uploading…",
                });
                
                const fileToUpload = await compressImage(file);
                let finalFile = fileToUpload;
                
                if (finalFile.name.toLowerCase().startsWith("inbound")) {
                    let ext = finalFile.name.includes(".") ? `.${finalFile.name.split(".").pop()}` : "";
                    if (!ext && finalFile.type) {
                        ext = finalFile.type === "image/jpeg" ? ".jpg" : `.${finalFile.type.split("/").pop()}`;
                        if (ext === ".html" || ext === ".htm") ext = ""; // Ignore weird default mime types sometimes
                    }
                    const today = new Date();
                    const dateStr = `${today.getFullYear()}${(today.getMonth()+1).toString().padStart(2,'0')}${today.getDate().toString().padStart(2,'0')}`;
                    const timeStr = `${today.getHours().toString().padStart(2,'0')}${today.getMinutes().toString().padStart(2,'0')}`;
                    const suggestedName = `Upload_${dateStr}_${timeStr}${ext}`;
                    
                    finalFile = new File([finalFile], suggestedName, { type: finalFile.type });
                }

                const existingFile = files.find(f => f.name === finalFile.name);
                if (existingFile) {
                    updateTask(taskId, { detail: `Waiting for your choice · ${finalFile.name}` });
                    const choice = await askDuplicateAction(finalFile.name);
                    setDuplicatePrompt(null);
                    
                    if (choice === 'skip') {
                        continue;
                    } else if (choice === 'replace') {
                        await deleteVaultFile(existingFile);
                    } else if (choice === 'keep') {
                        const nameParts = finalFile.name.split('.');
                        const ext = nameParts.length > 1 ? `.${nameParts.pop()}` : '';
                        const base = nameParts.join('.');
                        let newName = `${base} (1)${ext}`;
                        let counter = 1;
                        while(files.some(f => f.name === newName)) {
                            counter++;
                            newName = `${base} (${counter})${ext}`;
                        }
                        finalFile = new File([finalFile], newName, { type: finalFile.type });
                    }
                }
                
                if (currentStorageUsed + finalFile.size > storageLimit) {
                    stopMessage = `Not enough storage space to upload "${finalFile.name}".`;
                    break;
                }
                
                await uploadVaultFile(finalFile, currentFolderId, (progress) => {
                    const currentFileBytes = (progress / 100) * fileToUpload.size;
                    const overallProgress = Math.min(((uploadedBytes + currentFileBytes) / totalSize) * 100, 99.9);
                    setUploadProgress(overallProgress);
                    updateTask(taskId, { progress: overallProgress });
                });
                
                uploadedBytes += fileToUpload.size;
                currentStorageUsed += fileToUpload.size;
                uploadedCount++;
                lastUploadedName = finalFile.name;
            }
            
            setUploadProgress(100);

            if (fileInputRef.current) fileInputRef.current.value = "";

            if (stopMessage) {
                finishTask(taskId, {
                    status: "error",
                    title: uploadedCount > 0 ? `Uploaded ${uploadedCount} of ${fileCount} files` : "Upload stopped",
                    detail: stopMessage,
                });
            } else if (uploadedCount === 0) {
                dismissTask(taskId);
            } else {
                finishTask(taskId, {
                    status: "success",
                    title: uploadedCount === 1 ? `Uploaded "${lastUploadedName}"` : `Uploaded ${uploadedCount} files`,
                });
            }
        } catch (err) {
            console.error("Upload failed", err);
            finishTask(taskId, {
                status: "error",
                title: uploadedCount > 0 ? `Uploaded ${uploadedCount} of ${fileCount} files` : "Upload failed",
                detail: "Something went wrong while uploading. Please try again.",
            });
        } finally {
            setUploadProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        await uploadFileList(Array.from(e.target.files || []));
    };

    // Keep the window-level drop listener pointed at the latest closure / state
    dropEnabledRef.current =
        uploadProgress === null && !isStorageAtLimit && !currentFolderId?.startsWith("__shared__");
    dropHandlerRef.current = (dropped) => { void uploadFileList(dropped); };

    const handleFileViewClick = async (file: VaultFile) => {
        const isImage = file.type.startsWith("image/");
        if (isImage) {
            setZoomLevel(1);
            setPan({ x: 0, y: 0 });
        }
        setZoomLevel(1);
        setPan({ x: 0, y: 0 });
        if (imageCache[file.id]) {
            if (isOfficeFile(file.type) && officeDataCache[file.id]) {
                setSelectedImage({ 
                    file, 
                    url: imageCache[file.id], 
                    officeData: officeDataCache[file.id].arrayBuffer,
                    excelHtml: officeDataCache[file.id].excelHtml,
                    pptxThumbnailUrl: officeDataCache[file.id].pptxThumbnailUrl
                });
            } else {
                setSelectedImage({ file, url: imageCache[file.id] });
            }
            return;
        }
        setActionLoading(true);
        setLoadingFileId(file.id);
        try {
            const blob = await downloadVaultFile(file);
            const url = URL.createObjectURL(blob);
            setImageCache(prev => ({ ...prev, [file.id]: url }));

            if (file.type === "application/pdf") {
                // Pass raw data to react-pdf instead of blob URL (fixes mobile)
                const arrayBuffer = await blob.arrayBuffer();
                setSelectedImage({ file, url, pdfData: new Uint8Array(arrayBuffer) });
            } else if (isOfficeFile(file.type)) {
                const arrayBuffer = await blob.arrayBuffer();
                let excelHtml = undefined;
                let pptxThumbnailUrl = undefined;
                
                if (isExcelFile(file.type)) {
                    try {
                        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        worksheet['!ref'] = 'A1:AJ50'; // Force preview to show exactly A1 to AJ50
                        let rawHtml = XLSX.utils.sheet_to_html(worksheet);
                        if (worksheet['!ref']) {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(rawHtml, 'text/html');
                            const table = doc.querySelector('table');
                            if (table) {
                                const range = XLSX.utils.decode_range(worksheet['!ref']);
                                const colCount = range.e.c;
                                
                                const headerRow = doc.createElement('tr');
                                const cornerTh = doc.createElement('th');
                                cornerTh.style.background = '#f3f4f6';
                                cornerTh.style.border = '1px solid #ccc';
                                cornerTh.style.minWidth = '40px';
                                headerRow.appendChild(cornerTh);
                                
                                for (let i = 0; i <= colCount; i++) {
                                    const th = doc.createElement('th');
                                    th.textContent = XLSX.utils.encode_col(i);
                                    th.style.background = '#f3f4f6';
                                    th.style.border = '1px solid #ccc';
                                    th.style.padding = '4px 8px';
                                    th.style.textAlign = 'center';
                                    headerRow.appendChild(th);
                                }
                                table.prepend(headerRow);
                                
                                const rows = table.querySelectorAll('tr');
                                for (let i = 1; i < rows.length; i++) {
                                    const th = doc.createElement('th');
                                    th.textContent = i.toString();
                                    th.style.background = '#f3f4f6';
                                    th.style.border = '1px solid #ccc';
                                    th.style.padding = '4px 8px';
                                    th.style.textAlign = 'center';
                                    rows[i].prepend(th);
                                }
                                
                                const cells = table.querySelectorAll('td, th');
                                cells.forEach(cell => {
                                    (cell as HTMLElement).style.border = '1px solid #ccc';
                                });
                                
                                table.style.borderCollapse = 'collapse';
                                excelHtml = sanitizeExcelHtml(table.outerHTML);
                            } else {
                                excelHtml = sanitizeExcelHtml(rawHtml);
                            }
                        } else {
                            excelHtml = sanitizeExcelHtml(rawHtml);
                        }
                    } catch (e) {
                        console.error("Excel parse failed", e);
                    }
                } else if (isPptxFile(file.type)) {
                    try {
                        const zip = await JSZip.loadAsync(arrayBuffer);
                        const thumbnailFile = zip.file("docProps/thumbnail.jpeg");
                        if (thumbnailFile) {
                            const thumbBlob = await thumbnailFile.async("blob");
                            pptxThumbnailUrl = URL.createObjectURL(thumbBlob);
                        }
                    } catch (e) {
                        console.error("PPTX thumb parse failed", e);
                    }
                }

                setOfficeDataCache(prev => ({ ...prev, [file.id]: { arrayBuffer, excelHtml, pptxThumbnailUrl } }));
                setSelectedImage({ file, url, officeData: arrayBuffer, excelHtml, pptxThumbnailUrl });
            } else {
                setSelectedImage({ file, url });
            }
        } catch (err) {
            console.error("Failed to load file", err);
            alert("Failed to load file.");
        } finally {
            setActionLoading(false);
            setLoadingFileId(null);
        }
    };

    const handleFileClick = async (file: VaultFile) => {
        const previewable = file.type.startsWith("image/") || 
                            file.type === "application/pdf" ||
                            file.type.startsWith("video/") ||
                            file.type.startsWith("audio/") ||
                            file.type.startsWith("text/") ||
                            isOfficeFile(file.type);
                            
        if (previewable) {
            handleFileViewClick(file);
        } else {
            // Unsupported file type — prompt user to download
            setDownloadPromptFile(file);
        }
    };

    const handleDownload = async (file: VaultFile) => {
        setActionLoading(true);
        setLoadingFileId(file.id);
        try {
            if (selectedImage && selectedImage.file.id === file.id && selectedImage.url) {
                const a = document.createElement("a");
                a.href = selectedImage.url;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return;
            }
            const matchingShare = sharedItems.find(s => s.id === file.id || file.id.startsWith(`${s.id}:`));
            if (matchingShare) {
                const fileEntry = matchingShare.files.find(f => `${matchingShare.id}:${f.storagePath}` === file.id) || matchingShare.files[0];
                if (fileEntry) {
                    await handleDownloadSharedFile(matchingShare, fileEntry);
                    return;
                }
            }
            const blob = await downloadVaultFile(file);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Download failed", err);
            alert("Failed to download or decrypt file.");
        } finally {
            setActionLoading(false);
            setLoadingFileId(null);
        }
    };

    const handleToggleFileSelection = (fileId: string) => {
        setSelectedFiles(prev => {
            const newSet = new Set(prev);
            if (newSet.has(fileId)) newSet.delete(fileId);
            else newSet.add(fileId);
            return newSet;
        });
    };

    const handleToggleFolderSelection = (folderId: string) => {
        setSelectedFolders(prev => {
            const newSet = new Set(prev);
            if (newSet.has(folderId)) newSet.delete(folderId);
            else newSet.add(folderId);
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (selectedFiles.size === files.length && selectedFolders.size === folders.length) {
            setSelectedFiles(new Set());
            setSelectedFolders(new Set());
        } else {
            setSelectedFiles(new Set(files.map(f => f.id)));
            setSelectedFolders(new Set(folders.map(f => f.id)));
        }
    };

    const confirmBulkDelete = async () => {
        const total = selectedFiles.size + selectedFolders.size;
        setActionLoading(true);
        setLoadingBulkAction('delete');
        const taskId = startTask({
            title: total === 1 ? "Deleting 1 item" : `Deleting ${total} items`,
            detail: `0 of ${total} deleted`,
            progress: 0,
        });
        let done = 0;
        const tick = () => {
            done++;
            updateTask(taskId, { progress: (done / total) * 100, detail: `${done} of ${total} deleted` });
        };
        try {
            await Promise.all([
                ...Array.from(selectedFiles).map(async id => {
                    const f = files.find(file => file.id === id);
                    if (f) await deleteVaultFile(f);
                    tick();
                }),
                ...Array.from(selectedFolders).map(async id => {
                    await deleteFolder(id);
                    tick();
                })
            ]);
            setSelectedFiles(new Set());
            setSelectedFolders(new Set());
            setBulkDeleteModalOpen(false);
            finishTask(taskId, { status: "success", title: total === 1 ? "Deleted 1 item" : `Deleted ${total} items` });
        } catch (e) {
            console.error(e);
            finishTask(taskId, { status: "error", title: "Couldn't delete some items", detail: `${done} of ${total} deleted. Please try again.` });
        } finally {
            setActionLoading(false);
            setLoadingBulkAction(null);
        }
    };

    const handleShareTarget = (target: { id: string; name: string; isFolder: boolean; file?: VaultFile; sharedItem?: SharedItem; sharedFileEntry?: SharedFileEntry }) => {
        if (target.sharedItem) {
            setItemsToShare([{
                kind: "shared",
                share: target.sharedItem,
                fileEntry: target.sharedFileEntry || (target.sharedItem.itemType === "file" ? target.sharedItem.files[0] : undefined),
            }]);
        } else if (target.isFolder) {
            const fo = folders.find(f => f.id === target.id);
            if (fo) setItemsToShare([{ kind: "folder", folder: fo }]);
        } else if (target.file) {
            setItemsToShare([{ kind: "file", file: target.file }]);
        }
        setShareModalOpen(true);
    };

    const handleBulkShare = () => {
        const items: ShareableItem[] = [];
        selectedFolders.forEach(id => {
            const fo = folders.find(f => f.id === id);
            if (fo) items.push({ kind: "folder", folder: fo });
        });
        selectedFiles.forEach(id => {
            const fi = files.find(f => f.id === id);
            if (fi) items.push({ kind: "file", file: fi });
        });
        if (items.length === 0) return;
        setItemsToShare(items);
        setShareModalOpen(true);
    };

    const handleDownloadSharedFile = async (share: SharedItem, file: SharedFileEntry) => {
        const key = `${share.id}:${file.storagePath}`;
        setDownloadingSharedId(key);
        try {
            const blob = await downloadSharedFile(share, file);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to download shared file:", err);
            alert("Failed to download shared file. It may have been removed or access revoked.");
        } finally {
            setDownloadingSharedId(null);
        }
    };

    const handleDownloadAllShared = async (share: SharedItem) => {
        setDownloadingSharedId(share.id);
        try {
            const zip = new JSZip();
            for (const file of share.files) {
                const blob = await downloadSharedFile(share, file);
                zip.file(file.path, blob);
            }
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${share.name || "shared-files"}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to download shared ZIP:", err);
            alert("Failed to download all shared files.");
        } finally {
            setDownloadingSharedId(null);
        }
    };

    const handleConfirmRemoveShare = async () => {
        if (!confirmRemoveShare) return;
        setActionLoading(true);
        try {
            await removeShare(confirmRemoveShare.id);
            if (currentFolderId === `__shared__:${confirmRemoveShare.id}`) {
                navigateToFolder("__shared__", "Shared with Me");
            }
            setConfirmRemoveShare(null);
            setSelectedImage(prev => prev && prev.sharedItem?.id === confirmRemoveShare.id ? null : prev);
            await refreshShares();
        } catch (err) {
            console.error("Failed to remove share:", err);
            alert("Failed to remove share.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleSharedFileViewClick = async (share: SharedItem, fileEntry: SharedFileEntry, fileId: string, displayName: string) => {
        const fileType = resolveMimeType(displayName, fileEntry.type);
        const syntheticFile: VaultFile = {
            id: fileId,
            name: displayName,
            type: fileType,
            size: fileEntry.size,
            folderId: null,
            storagePath: fileEntry.storagePath,
            createdAt: share.createdAt,
            updatedAt: share.createdAt,
        };

        if (imageCache[fileId]) {
            if (isOfficeFile(fileType) && officeDataCache[fileId]) {
                setSelectedImage({ 
                    file: syntheticFile, 
                    url: imageCache[fileId], 
                    officeData: officeDataCache[fileId].arrayBuffer,
                    excelHtml: officeDataCache[fileId].excelHtml,
                    pptxThumbnailUrl: officeDataCache[fileId].pptxThumbnailUrl,
                    sharedItem: share,
                    sharedFileEntry: fileEntry,
                });
            } else {
                setSelectedImage({ 
                    file: syntheticFile, 
                    url: imageCache[fileId],
                    sharedItem: share,
                    sharedFileEntry: fileEntry,
                });
            }
            return;
        }

        setActionLoading(true);
        setLoadingFileId(fileId);
        try {
            const blob = await downloadSharedFile(share, fileEntry);
            const url = URL.createObjectURL(blob);
            setImageCache(prev => ({ ...prev, [fileId]: url }));

            if (fileType === "application/pdf") {
                const arrayBuffer = await blob.arrayBuffer();
                setSelectedImage({ 
                    file: syntheticFile, 
                    url, 
                    pdfData: new Uint8Array(arrayBuffer),
                    sharedItem: share,
                    sharedFileEntry: fileEntry,
                });
            } else if (isOfficeFile(fileType)) {
                const arrayBuffer = await blob.arrayBuffer();
                let excelHtml = undefined;
                let pptxThumbnailUrl = undefined;
                
                if (isExcelFile(fileType)) {
                    try {
                        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                        const firstSheetName = workbook.SheetNames[0];
                        const worksheet = workbook.Sheets[firstSheetName];
                        worksheet['!ref'] = 'A1:AJ50';
                        let rawHtml = XLSX.utils.sheet_to_html(worksheet);
                        if (worksheet['!ref']) {
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(rawHtml, 'text/html');
                            const table = doc.querySelector('table');
                            if (table) {
                                const range = XLSX.utils.decode_range(worksheet['!ref']);
                                const colCount = range.e.c;
                                
                                const headerRow = doc.createElement('tr');
                                const cornerTh = doc.createElement('th');
                                cornerTh.style.background = '#f3f4f6';
                                cornerTh.style.border = '1px solid #ccc';
                                cornerTh.style.minWidth = '40px';
                                headerRow.appendChild(cornerTh);
                                
                                for (let i = 0; i <= colCount; i++) {
                                    const th = doc.createElement('th');
                                    th.textContent = XLSX.utils.encode_col(i);
                                    th.style.background = '#f3f4f6';
                                    th.style.border = '1px solid #ccc';
                                    th.style.padding = '4px 8px';
                                    th.style.textAlign = 'center';
                                    headerRow.appendChild(th);
                                }
                                table.prepend(headerRow);
                                
                                const rows = table.querySelectorAll('tr');
                                for (let i = 1; i < rows.length; i++) {
                                    const th = doc.createElement('th');
                                    th.textContent = i.toString();
                                    th.style.background = '#f3f4f6';
                                    th.style.border = '1px solid #ccc';
                                    th.style.padding = '4px 8px';
                                    th.style.textAlign = 'center';
                                    rows[i].prepend(th);
                                }
                                
                                const cells = table.querySelectorAll('td, th');
                                cells.forEach(cell => {
                                    (cell as HTMLElement).style.border = '1px solid #ccc';
                                });
                                
                                table.style.borderCollapse = 'collapse';
                                excelHtml = sanitizeExcelHtml(table.outerHTML);
                            } else {
                                excelHtml = sanitizeExcelHtml(rawHtml);
                            }
                        } else {
                            excelHtml = sanitizeExcelHtml(rawHtml);
                        }
                    } catch (e) {
                        console.error("Excel parse failed", e);
                    }
                } else if (isPptxFile(fileType)) {
                    try {
                        const zip = await JSZip.loadAsync(arrayBuffer);
                        const thumbnailFile = zip.file("docProps/thumbnail.jpeg");
                        if (thumbnailFile) {
                            const thumbBlob = await thumbnailFile.async("blob");
                            pptxThumbnailUrl = URL.createObjectURL(thumbBlob);
                        }
                    } catch (e) {
                        console.error("PPTX thumb parse failed", e);
                    }
                }

                setOfficeDataCache(prev => ({ ...prev, [fileId]: { arrayBuffer, excelHtml, pptxThumbnailUrl } }));
                setSelectedImage({ 
                    file: syntheticFile, 
                    url, 
                    officeData: arrayBuffer, 
                    excelHtml, 
                    pptxThumbnailUrl,
                    sharedItem: share,
                    sharedFileEntry: fileEntry,
                });
            } else {
                setSelectedImage({ 
                    file: syntheticFile, 
                    url,
                    sharedItem: share,
                    sharedFileEntry: fileEntry,
                });
            }
        } catch (err) {
            console.error("Failed to load shared file", err);
            alert("Failed to load file.");
        } finally {
            setActionLoading(false);
            setLoadingFileId(null);
        }
    };

    const handleSharedItemClick = async (item: SharedItem) => {
        if (item.itemType === "folder") {
            navigateToFolder(`__shared__:${item.id}`, item.name);
            return;
        }
        if (!item.files[0]) return;
        const fileEntry = item.files[0];
        const fileType = resolveMimeType(item.name, fileEntry.type);
        const previewable = fileType.startsWith("image/") || 
                            fileType === "application/pdf" ||
                            fileType.startsWith("video/") ||
                            fileType.startsWith("audio/") ||
                            fileType.startsWith("text/") ||
                            isOfficeFile(fileType);
                            
        if (previewable) {
            void handleSharedFileViewClick(item, fileEntry, item.id, item.name);
        } else {
            const syntheticFile: VaultFile = {
                id: item.id,
                name: item.name,
                type: fileType,
                size: fileEntry.size,
                folderId: null,
                storagePath: fileEntry.storagePath,
                createdAt: item.createdAt,
                updatedAt: item.createdAt,
            };
            setDownloadPromptFile(syntheticFile);
        }
    };

    const handleSharedFileEntryClick = async (share: SharedItem, fileEntry: SharedFileEntry) => {
        const fileId = `${share.id}:${fileEntry.storagePath}`;
        const displayName = fileEntry.name || fileEntry.path;
        const fileType = resolveMimeType(displayName, fileEntry.type);
        const previewable = fileType.startsWith("image/") || 
                            fileType === "application/pdf" ||
                            fileType.startsWith("video/") ||
                            fileType.startsWith("audio/") ||
                            fileType.startsWith("text/") ||
                            isOfficeFile(fileType);
                            
        if (previewable) {
            void handleSharedFileViewClick(share, fileEntry, fileId, displayName);
        } else {
            const syntheticFile: VaultFile = {
                id: fileId,
                name: displayName,
                type: fileType,
                size: fileEntry.size,
                folderId: null,
                storagePath: fileEntry.storagePath,
                createdAt: share.createdAt,
                updatedAt: share.createdAt,
            };
            setDownloadPromptFile(syntheticFile);
        }
    };

    const getSelectedSharedTargets = () => {
        const targets: { share: SharedItem; fileEntry?: SharedFileEntry }[] = [];
        
        sharedItems.forEach(item => {
            if (selectedSharedIds.has(item.id)) {
                targets.push({ share: item, fileEntry: item.itemType === "file" ? item.files[0] : undefined });
            }
        });

        if (currentFolderId?.startsWith("__shared__:")) {
            const shareId = currentFolderId.replace("__shared__:", "");
            const activeShare = sharedItems.find(s => s.id === shareId);
            if (activeShare) {
                activeShare.files.forEach(f => {
                    const key = `${activeShare.id}:${f.storagePath}`;
                    if (selectedSharedIds.has(key)) {
                        targets.push({ share: activeShare, fileEntry: f });
                    }
                });
            }
        }

        return targets;
    };

    const handleBulkDownloadShared = async () => {
        const targets = getSelectedSharedTargets();
        if (targets.length === 0) return;
        setActionLoading(true);
        const taskId = startTask({ title: "Downloading selected", detail: "Downloading shared items…" });
        try {
            for (const t of targets) {
                if (t.fileEntry) {
                    await handleDownloadSharedFile(t.share, t.fileEntry);
                } else {
                    await handleDownloadAllShared(t.share);
                }
            }
            finishTask(taskId, { status: "success", title: "Download complete" });
        } catch (e) {
            console.error(e);
            finishTask(taskId, { status: "error", title: "Download failed" });
        } finally {
            setActionLoading(false);
        }
    };

    const handleBulkMoveShared = async (targetFolderId: string | null) => {
        setBulkMoveSharedModalOpen(false);
        const targets = getSelectedSharedTargets();
        if (targets.length === 0) return;
        const total = targets.length;
        setActionLoading(true);
        const taskId = startTask({
            title: total === 1 ? "Moving 1 item" : `Moving ${total} items`,
            detail: `0 of ${total} moved`,
            progress: 0,
        });
        let done = 0;
        const tick = () => {
            done++;
            updateTask(taskId, { progress: (done / total) * 100, detail: `${done} of ${total} moved` });
        };
        try {
            const sharesToRemove = new Set<string>();
            for (const t of targets) {
                if (t.fileEntry) {
                    const blob = await downloadSharedFile(t.share, t.fileEntry);
                    const fileObj = new File([blob], t.fileEntry.name, { type: t.fileEntry.type });
                    await uploadVaultFile(fileObj, targetFolderId);
                    if (t.share.itemType === "file" && !t.share.isSender) {
                        sharesToRemove.add(t.share.id);
                    }
                } else if (t.share.itemType === "folder") {
                    const newFolderId = await createFolder(t.share.name, targetFolderId);
                    for (const f of t.share.files) {
                        const blob = await downloadSharedFile(t.share, f);
                        const fileObj = new File([blob], f.name, { type: f.type });
                        await uploadVaultFile(fileObj, newFolderId);
                    }
                    if (!t.share.isSender) {
                        sharesToRemove.add(t.share.id);
                    }
                }
                tick();
            }
            for (const shareId of sharesToRemove) {
                await removeShare(shareId);
            }
            setSelectedSharedIds(new Set());
            await refreshShares();
            finishTask(taskId, { status: "success", title: total === 1 ? "Moved 1 item" : `Moved ${total} items` });
        } catch (e) {
            console.error(e);
            finishTask(taskId, { status: "error", title: "Couldn't move some items", detail: `${done} of ${total} moved. Please try again.` });
        } finally {
            setActionLoading(false);
        }
    };

    const handleBulkShareShared = () => {
        const targets = getSelectedSharedTargets();
        if (targets.length === 0) return;
        const items: ShareableItem[] = targets.map(t => ({
            kind: "shared",
            share: t.share,
            fileEntry: t.fileEntry,
        }));
        setItemsToShare(items);
        setShareModalOpen(true);
    };

    const handleBulkDeleteShared = async () => {
        const targets = getSelectedSharedTargets();
        if (targets.length === 0) return;
        setActionLoading(true);
        const taskId = startTask({ title: "Deleting selected", detail: "Removing shared items…" });
        try {
            const shareIds = new Set<string>();
            targets.forEach(t => shareIds.add(t.share.id));
            for (const shareId of shareIds) {
                await removeShare(shareId);
            }
            setSelectedSharedIds(new Set());
            await refreshShares();
            finishTask(taskId, { status: "success", title: "Deleted selected items" });
        } catch (e) {
            console.error(e);
            finishTask(taskId, { status: "error", title: "Failed to delete items" });
        } finally {
            setActionLoading(false);
        }
    };

    const handleBulkMove = async (targetFolderId: string | null) => {
        setBulkMoveModalOpen(false);
        if (targetFolderId === currentFolderId) return;
        const total = selectedFiles.size + selectedFolders.size;
        setActionLoading(true);
        setLoadingBulkAction('move');
        const taskId = startTask({
            title: total === 1 ? "Moving 1 item" : `Moving ${total} items`,
            detail: `0 of ${total} moved`,
            progress: 0,
        });
        let done = 0;
        const tick = () => {
            done++;
            updateTask(taskId, { progress: (done / total) * 100, detail: `${done} of ${total} moved` });
        };
        try {
            await Promise.all([
                ...Array.from(selectedFiles).map(async id => {
                    const f = files.find(file => file.id === id);
                    if (f) await moveVaultFile(id, targetFolderId);
                    tick();
                }),
                ...Array.from(selectedFolders).map(async id => {
                    await moveFolder(id, targetFolderId);
                    tick();
                })
            ]);
            setSelectedFiles(new Set());
            setSelectedFolders(new Set());
            finishTask(taskId, { status: "success", title: total === 1 ? "Moved 1 item" : `Moved ${total} items` });
        } catch (e) {
            console.error(e);
            finishTask(taskId, { status: "error", title: "Couldn't move some items", detail: `${done} of ${total} moved. Please try again.` });
        }
        setActionLoading(false);
        setLoadingBulkAction(null);
    };

    const handleBulkDownload = async () => {
        if (selectedFiles.size === 0 && selectedFolders.size === 0) return;
        setActionLoading(true);
        setLoadingBulkAction('download');
        const taskId = startTask({ title: "Preparing download", detail: "Decrypting and zipping selected items…" });
        try {
            const zip = new JSZip();
            
            // Add individually selected files to root of zip
            await Promise.all(Array.from(selectedFiles).map(async id => {
                const f = files.find(file => file.id === id);
                if (f) {
                    const blob = await downloadVaultFile(f);
                    zip.file(f.name, blob);
                }
            }));

            // Handle folders recursively
            if (selectedFolders.size > 0) {
                const allFolders = await getAllFolders();
                
                const getSubfolderIds = (parentId: string): string[] => {
                    const children = allFolders.filter(f => f.parentId === parentId).map(f => f.id);
                    return children.reduce((acc, childId) => [...acc, childId, ...getSubfolderIds(childId)], [] as string[]);
                };

                const getFolderPath = (folderId: string, stopAtParentId: string | null): string => {
                    const f = allFolders.find(f => f.id === folderId);
                    if (!f) return "";
                    if (f.parentId === stopAtParentId) return f.name;
                    const parentPath = f.parentId ? getFolderPath(f.parentId, stopAtParentId) : "";
                    return parentPath ? `${parentPath}/${f.name}` : f.name;
                };

                await Promise.all(Array.from(selectedFolders).map(async rootFolderId => {
                    const folderIds = [rootFolderId, ...getSubfolderIds(rootFolderId)];
                    
                    await Promise.all(folderIds.map(async folderId => {
                        const folderPath = getFolderPath(folderId, currentFolderId);
                        if (folderPath) zip.folder(folderPath);

                        const folderFiles = await getFilesInFolder(folderId);
                        
                        await Promise.all(folderFiles.map(async f => {
                            const blob = await downloadVaultFile(f);
                            zip.file(`${folderPath}/${f.name}`, blob);
                        }));
                    }));
                }));
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `bulk-download-${Date.now()}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setSelectedFiles(new Set());
            setSelectedFolders(new Set());
            finishTask(taskId, { status: "success", title: "Download ready", detail: "Your ZIP file is downloading." });
        } catch (e) {
            console.error(e);
            finishTask(taskId, { status: "error", title: "Download failed", detail: "Something went wrong while preparing your download." });
        }
        setActionLoading(false);
        setLoadingBulkAction(null);
    };


    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const getFileIcon = (file: VaultFile) => {
        const type = (file.type || '').toLowerCase();
        const name = (file.name || '').toLowerCase();
        
        if (name.endsWith('.doc') || name.endsWith('.docx') || type.includes('word')) return <FaFileWord size={18} style={{ color: "#2b579a" }} />;
        if (name.endsWith('.xls') || name.endsWith('.xlsx') || type.includes('excel') || type.includes('spreadsheet')) return <FaFileExcel size={18} style={{ color: "#217346" }} />;
        if (name.endsWith('.ppt') || name.endsWith('.pptx') || type.includes('powerpoint') || type.includes('presentation')) return <FaFilePowerpoint size={18} style={{ color: "#d24726" }} />;
        if (name.endsWith('.csv') || type.includes('csv')) return <FaFileCsv size={18} style={{ color: "#4caf50" }} />;
        if (name.endsWith('.pdf') || type.includes('pdf')) return <FaFilePdf size={18} style={{ color: "#ea4335" }} />;

        if (type.includes("image") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) return <FiImage size={18} style={{ color: "#4caf50" }} />;
        if (type.includes("video") || /\.(mp4|mov|avi|mkv|webm)$/i.test(name)) return <FiVideo size={18} style={{ color: "#f44336" }} />;
        if (type.includes("audio") || /\.(mp3|wav|ogg|m4a|flac)$/i.test(name)) return <FiMusic size={18} style={{ color: "#9c27b0" }} />;
        if (type.includes("text") || type.includes("document") || /\.(txt|md|rtf)$/i.test(name)) return <FiFileText size={18} style={{ color: "#2196f3" }} />;
        if (type.includes("zip") || type.includes("tar") || type.includes("rar") || /\.(zip|tar|gz|rar|7z)$/i.test(name)) return <FiArchive size={18} style={{ color: "#ff9800" }} />;
        return <FiFile size={18} style={{ color: "var(--text-secondary)" }} />;
    };

    const getSharedItemIcon = (name: string, isFolder: boolean, folderColor?: string, mimeType?: string) => {
        if (isFolder) {
            return (
                <FiFolder 
                    size={18} 
                    style={{ color: folderColor ? "transparent" : "var(--text-primary)" }}
                    fill={folderColor ? `url(#gradient-${folderColor})` : "none"}
                />
            );
        }
        const n = (name || '').toLowerCase();
        const m = (mimeType || '').toLowerCase();
        if (n.endsWith('.doc') || n.endsWith('.docx') || n.includes('word') || m.includes('word')) return <FaFileWord size={18} style={{ color: "#2b579a" }} />;
        if (n.endsWith('.xls') || n.endsWith('.xlsx') || n.includes('excel') || n.includes('spreadsheet') || m.includes('excel') || m.includes('spreadsheet')) return <FaFileExcel size={18} style={{ color: "#217346" }} />;
        if (n.endsWith('.ppt') || n.endsWith('.pptx') || n.includes('powerpoint') || n.includes('presentation') || m.includes('powerpoint') || m.includes('presentation')) return <FaFilePowerpoint size={18} style={{ color: "#d24726" }} />;
        if (n.endsWith('.csv') || n.includes('csv') || m.includes('csv')) return <FaFileCsv size={18} style={{ color: "#4caf50" }} />;
        if (n.endsWith('.pdf') || n.includes('pdf') || m.includes('pdf')) return <FaFilePdf size={18} style={{ color: "#ea4335" }} />;

        if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(n) || n.includes('image') || m.startsWith('image/')) return <FiImage size={18} style={{ color: "#4caf50" }} />;
        if (/\.(mp4|mov|avi|mkv|webm)$/i.test(n) || n.includes('video') || m.startsWith('video/')) return <FiVideo size={18} style={{ color: "#f44336" }} />;
        if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(n) || n.includes('audio') || m.startsWith('audio/')) return <FiMusic size={18} style={{ color: "#9c27b0" }} />;
        if (/\.(txt|md|rtf)$/i.test(n) || n.includes('document') || m.startsWith('text/')) return <FiFileText size={18} style={{ color: "#2196f3" }} />;
        if (/\.(zip|tar|gz|rar|7z)$/i.test(n) || n.includes('zip') || n.includes('archive') || m.includes('zip') || m.includes('tar') || m.includes('compressed')) return <FiArchive size={18} style={{ color: "#ff9800" }} />;
        return <FiFile size={18} style={{ color: "var(--text-secondary)" }} />;
    };

    const sortedFolders = useMemo(() => {
        return [...folders].sort((a, b) => {
            let cmp = 0;
            if (sortBy === "name") {
                cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
            } else if (sortBy === "date") {
                const dateA = (a.updatedAt || a.createdAt)?.getTime() || 0;
                const dateB = (b.updatedAt || b.createdAt)?.getTime() || 0;
                cmp = dateA - dateB;
            } else if (sortBy === "type") {
                cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
            } else if (sortBy === "size") {
                cmp = (folderCounts[a.id] || 0) - (folderCounts[b.id] || 0);
            }
            return sortOrder === "asc" ? cmp : -cmp;
        });
    }, [folders, sortBy, sortOrder, folderCounts]);

    const sortedFiles = useMemo(() => {
        return [...files].sort((a, b) => {
            let cmp = 0;
            if (sortBy === "name") {
                cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
            } else if (sortBy === "date") {
                const dateA = (a.updatedAt || a.createdAt)?.getTime() || 0;
                const dateB = (b.updatedAt || b.createdAt)?.getTime() || 0;
                cmp = dateA - dateB;
            } else if (sortBy === "type") {
                const typeA = getFileTypeLabel(a.name, false, a.type);
                const typeB = getFileTypeLabel(b.name, false, b.type);
                cmp = typeA.localeCompare(typeB);
                if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
            } else if (sortBy === "size") {
                cmp = a.size - b.size;
            }
            return sortOrder === "asc" ? cmp : -cmp;
        });
    }, [files, sortBy, sortOrder]);

    const sortedSharedItems = useMemo(() => {
        return [...sharedItems].sort((a, b) => {
            let cmp = 0;
            const isFolderA = a.itemType === "folder";
            const isFolderB = b.itemType === "folder";

            if (sortBy === "name") {
                cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
            } else if (sortBy === "date") {
                const dateA = a.createdAt?.getTime() || 0;
                const dateB = b.createdAt?.getTime() || 0;
                cmp = dateA - dateB;
            } else if (sortBy === "type") {
                const typeA = getFileTypeLabel(a.name, isFolderA, a.files[0]?.type);
                const typeB = getFileTypeLabel(b.name, isFolderB, b.files[0]?.type);
                cmp = typeA.localeCompare(typeB);
                if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
            } else if (sortBy === "size") {
                const sizeA = a.files.reduce((sum, f) => sum + (f.size || 0), 0);
                const sizeB = b.files.reduce((sum, f) => sum + (f.size || 0), 0);
                cmp = sizeA - sizeB;
            }
            return sortOrder === "asc" ? cmp : -cmp;
        });
    }, [sharedItems, sortBy, sortOrder]);

    const getSortedShareFiles = (filesList: SharedFileEntry[]) => {
        return [...filesList].sort((a, b) => {
            let cmp = 0;
            if (sortBy === "name") {
                cmp = a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
            } else if (sortBy === "type") {
                const typeA = getFileTypeLabel(a.path, false, a.type);
                const typeB = getFileTypeLabel(b.path, false, b.type);
                cmp = typeA.localeCompare(typeB);
                if (cmp === 0) cmp = a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: "base" });
            } else if (sortBy === "size") {
                cmp = a.size - b.size;
            }
            return sortOrder === "asc" ? cmp : -cmp;
        });
    };

    const renderSortChevron = (column: "name" | "date" | "type" | "size") => {
        if (sortBy !== column) return null;
        return sortOrder === "asc" ? <FiChevronUp size={13} style={{ flexShrink: 0 }} /> : <FiChevronDown size={13} style={{ flexShrink: 0 }} />;
    };

    const renderListHeader = (options?: {
        isAllSelected?: boolean;
        isPartiallySelected?: boolean;
        onToggleSelectAll?: () => void;
        hasItems?: boolean;
    }) => {
        if (viewMode !== "list") return null;
        return (
            <div className="file-list-header">
                <div className="file-list-header-visual">
                    {options?.hasItems && (
                        <input 
                            type="checkbox" 
                            ref={(el) => {
                                if (el) {
                                    el.indeterminate = !options.isAllSelected && !!options.isPartiallySelected;
                                }
                            }}
                            checked={!!options.isAllSelected}
                            onChange={options.onToggleSelectAll}
                            className="minimal-checkbox"
                            title={options.isAllSelected ? "Deselect All" : "Select All"}
                            aria-label="Select All"
                        />
                    )}
                </div>
                <div className="file-list-header-info">
                    <span 
                        className="file-list-header-col file-list-header-name sortable"
                        onClick={() => handleSort("name")}
                    >
                        Name {renderSortChevron("name")}
                    </span>
                    <span 
                        className="file-list-header-col file-date sortable"
                        onClick={() => handleSort("date")}
                    >
                        Date modified {renderSortChevron("date")}
                    </span>
                    <span 
                        className="file-list-header-col file-type sortable"
                        onClick={() => handleSort("type")}
                    >
                        Type {renderSortChevron("type")}
                    </span>
                    <span 
                        className="file-list-header-col file-size sortable"
                        onClick={() => handleSort("size")}
                    >
                        Size {renderSortChevron("size")}
                    </span>
                </div>
                <div className="file-list-header-details">
                    Details
                </div>
            </div>
        );
    };

    return (
        <div className="file-explorer">
            {isDragOver && (
                <div className="file-drop-overlay">
                    <div className="file-drop-card">
                        <FiUploadCloud size={56} className="file-drop-icon" />
                        <h3>Drop files to upload</h3>
                        <p>Files will be uploaded to <strong>{breadcrumbs[breadcrumbs.length - 1]?.name || "Home"}</strong></p>
                    </div>
                </div>
            )}
            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    {gradientColorsList.map(c => (
                        <linearGradient key={c.id} id={`gradient-${c.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop stopColor={c.start} offset="0%" />
                            {c.mid && <stop stopColor={c.mid} offset="50%" />}
                            <stop stopColor={c.end} offset="100%" />
                        </linearGradient>
                    ))}
                </defs>
            </svg>
            
            <div className="file-explorer-header">
                <h1 className="page-title">Secure File Storage</h1>
                <p className="page-subtitle" style={{ marginBottom: "16px" }}>Encrypted document storage</p>
            </div>
            <div className="file-toolbar">
                <div className="file-toolbar-actions">
                    <button 
                        className="auth-submit file-action-btn" 
                        onClick={() => setNewFolderModalOpen(true)} 
                        disabled={!!currentFolderId?.startsWith("__shared__")}
                    >
                        <FiPlus /> New Folder
                    </button>
                    <button 
                        className="auth-submit file-action-btn file-action-btn-primary" 
                        onClick={handleUploadClick} 
                        disabled={uploadProgress !== null || isStorageAtLimit || !!currentFolderId?.startsWith("__shared__")}
                    >
                        {uploadProgress !== null ? (
                            <><FiLoader size={16} className="spin" /> Uploading {Math.round(uploadProgress)}%</>
                        ) : (
                            <><FiUpload /> Upload File</>
                        )}
                    </button>
                    <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} multiple />
                </div>
                
                <div className="file-toolbar-secondary">
                    <div className="file-view-toggle">
                        <button 
                            type="button" 
                            className={`file-view-btn ${viewMode === "grid" ? "active" : ""}`}
                            onClick={() => setViewMode("grid")}
                            title="Grid View"
                        >
                            <FiGrid />
                        </button>
                        <button 
                            type="button" 
                            className={`file-view-btn ${viewMode === "list" ? "active" : ""}`}
                            onClick={() => setViewMode("list")}
                            title="List View"
                        >
                            <FiList />
                        </button>
                    </div>

                    <div className="file-storage-meter">
                        <span className="file-storage-text">
                            {formatSize(storageUsed)} / {formatSize(storageLimit)} Used
                        </span>
                        <div className="file-storage-track">
                            <div 
                                className="file-storage-fill" 
                                style={{ 
                                    width: `${storageUsed > 0 ? Math.max(2, (storageUsed / storageLimit) * 100) : 0}%`, 
                                    background: isStorageAtLimit ? "var(--danger)" : "var(--accent)" 
                                }} 
                            />
                        </div>
                    </div>
                </div>
            </div>

            <div className="breadcrumbs">
                {breadcrumbs.map((crumb, idx) => (
                    <span key={crumb.id || "home"} className="breadcrumb-item">
                        <button 
                            className="breadcrumb-btn" 
                            disabled={loading}
                            onClick={() => navigateToFolder(crumb.id, crumb.name)}
                            style={{ 
                                color: idx === breadcrumbs.length - 1 ? "var(--text-primary)" : "var(--text-secondary)",
                                fontWeight: idx === breadcrumbs.length - 1 ? "600" : "normal",
                            }}
                        >
                            {crumb.id === null && <FiHome size={14} />}
                            {crumb.name}
                        </button>
                        {idx < breadcrumbs.length - 1 && <FiChevronRight size={14} style={{ color: "var(--text-muted)" }} />}
                    </span>
                ))}
            </div>

            {(viewMode === "grid" && !loading && !currentFolderId?.startsWith("__shared__") && (folders.length > 0 || files.length > 0)) && (
                <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: "16px" }}>
                    <input 
                        type="checkbox" 
                        ref={(el) => {
                            if (el) {
                                const allSelected = selectedFiles.size === files.length && selectedFolders.size === folders.length;
                                const someSelected = selectedFiles.size > 0 || selectedFolders.size > 0;
                                el.indeterminate = !allSelected && someSelected;
                            }
                        }}
                        checked={selectedFiles.size === files.length && selectedFolders.size === folders.length && (files.length > 0 || folders.length > 0)}
                        onChange={handleSelectAll}
                        className="minimal-checkbox"
                    />
                    <span style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500 }}>Select All</span>
                    {(selectedFiles.size > 0 || selectedFolders.size > 0) && (
                        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                            {selectedFiles.size + selectedFolders.size} Selected
                        </span>
                    )}
                </div>
            )}

            {currentFolderId === "__shared__" ? (
                <div>
                    {loadingShares ? (
                        <div style={{ textAlign: "center", padding: "40px" }}>
                            <div className="spin" style={{ display: "inline-block", border: "3px solid var(--border-color)", borderTopColor: "var(--accent)", borderRadius: "50%", width: "24px", height: "24px" }} />
                        </div>
                    ) : sharedItems.length === 0 ? (
                        <div className="empty-state">
                            <FiUsers size={48} style={{ color: "var(--text-muted)", marginBottom: "16px" }} />
                            <p>No files have been shared with you yet.</p>
                        </div>
                    ) : (
                        <>
                            {viewMode === "grid" && (
                                <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: "16px" }}>
                                    <input 
                                        type="checkbox" 
                                        ref={(el) => {
                                            if (el) {
                                                const allSelected = selectedSharedIds.size === sharedItems.length && sharedItems.length > 0;
                                                const someSelected = selectedSharedIds.size > 0;
                                                el.indeterminate = !allSelected && someSelected;
                                            }
                                        }}
                                        checked={selectedSharedIds.size === sharedItems.length && sharedItems.length > 0}
                                        onChange={() => {
                                            if (selectedSharedIds.size === sharedItems.length) {
                                                setSelectedSharedIds(new Set());
                                            } else {
                                                setSelectedSharedIds(new Set(sharedItems.map(item => item.id)));
                                            }
                                        }}
                                        className="minimal-checkbox"
                                    />
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500 }}>Select All</span>
                                    {selectedSharedIds.size > 0 && (
                                        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                                            {selectedSharedIds.size} Selected
                                        </span>
                                    )}
                                </div>
                            )}

                            {renderListHeader({
                                isAllSelected: selectedSharedIds.size === sharedItems.length && sharedItems.length > 0,
                                isPartiallySelected: selectedSharedIds.size > 0 && selectedSharedIds.size < sharedItems.length,
                                onToggleSelectAll: () => {
                                    if (selectedSharedIds.size === sharedItems.length) {
                                        setSelectedSharedIds(new Set());
                                    } else {
                                        setSelectedSharedIds(new Set(sharedItems.map(item => item.id)));
                                    }
                                },
                                hasItems: sharedItems.length > 0
                            })}
                            <div className={`file-grid ${viewMode === "list" ? "list-view" : ""}`}>
                                {sortedSharedItems.map((item) => {
                                    const isFolder = item.itemType === "folder";
                                    const totalSize = item.files.reduce((sum, f) => sum + (f.size || 0), 0);
                                    const isImage = !isFolder && item.files[0] && isImageFile(item.name, item.files[0]?.type, item.files[0]?.path);
                                    return (
                                        <div
                                            key={item.id}
                                            className="file-card"
                                            title={`${item.name} (From: ${item.senderName || item.senderEmail})`}
                                            onClick={() => {
                                                if (selectedSharedIds.size > 0) {
                                                    setSelectedSharedIds(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(item.id)) next.delete(item.id);
                                                        else next.add(item.id);
                                                        return next;
                                                    });
                                                } else {
                                                    void handleSharedItemClick(item);
                                                }
                                            }}
                                            onContextMenu={(e) => handleContextMenu(e, { id: item.id, name: item.name, isFolder, sharedItem: item })}
                                            onTouchStart={(e) => handleTouchStart(e, { id: item.id, name: item.name, isFolder, sharedItem: item })}
                                            onTouchEnd={handleTouchEnd}
                                            onTouchMove={handleTouchMove}
                                        >
                                            <div className="file-card-visual">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedSharedIds.has(item.id)} 
                                                    onChange={() => {
                                                        setSelectedSharedIds(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(item.id)) next.delete(item.id);
                                                            else next.add(item.id);
                                                            return next;
                                                        });
                                                    }} 
                                                    onClick={(e) => e.stopPropagation()} 
                                                    className="minimal-checkbox"
                                                />
                                                <div className="file-card-icon">
                                                    {loadingFileId === item.id ? (
                                                        <FiLoader size={16} className="spin" style={{ color: "var(--accent)" }} />
                                                    ) : isImage ? (
                                                        <SharedImageThumbnail share={item} fileEntry={item.files[0]} />
                                                    ) : (
                                                        getSharedItemIcon(item.name, isFolder, sharedFolderColors[item.id], item.files[0]?.type)
                                                    )}
                                                </div>
                                            </div>
                                            <div className="file-card-info">
                                                <span className="file-name" style={{ fontWeight: 'normal' }}>{item.name}</span>
                                                <span className="file-col file-date">{formatDateModified(item.createdAt)}</span>
                                                <span className="file-col file-type">{getFileTypeLabel(item.name, isFolder, item.files[0]?.type)}</span>
                                                <span className="file-col file-size">
                                                    {isFolder
                                                        ? (viewMode === "list" ? "" : `${item.files.length} item${item.files.length === 1 ? "" : "s"}`)
                                                        : formatSize(totalSize)}
                                                </span>
                                            </div>
                                            <div 
                                                className="file-actions" 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    handleContextMenu(e, { id: item.id, name: item.name, isFolder, sharedItem: item }); 
                                                }}
                                            >
                                                <button title="Options">
                                                    <FiMoreHorizontal size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            ) : currentFolderId?.startsWith("__shared__:") ? (
                (() => {
                    const shareId = currentFolderId.replace("__shared__:", "");
                    const activeShare = sharedItems.find(s => s.id === shareId);
                    if (!activeShare) {
                        return (
                            <div className="empty-state">
                                <p>Shared folder not found or revoked.</p>
                            </div>
                        );
                    }
                    return (
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", padding: "12px 16px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)" }}>
                                <div>
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                                        {activeShare.isSender
                                            ? `Shared with: ${activeShare.recipients.map(r => r.email).join(", ")}`
                                            : `Shared by: ${activeShare.senderEmail}`}
                                    </div>
                                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                        {activeShare.files.length} file{activeShare.files.length === 1 ? "" : "s"} • {activeShare.createdAt.toLocaleDateString()}
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "10px" }}>
                                    <button
                                        className="auth-submit"
                                        style={{ width: "auto", margin: 0, padding: "6px 14px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}
                                        onClick={() => handleDownloadAllShared(activeShare)}
                                        disabled={downloadingSharedId === activeShare.id}
                                    >
                                        {downloadingSharedId === activeShare.id ? <FiLoader className="spin" size={14} /> : <FiArchive size={14} />}
                                        Download All (ZIP)
                                    </button>
                                    <button
                                        className="auth-submit"
                                        style={{ width: "auto", margin: 0, padding: "6px 14px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: "1px solid var(--danger)", color: "var(--danger)" }}
                                        onClick={() => setConfirmRemoveShare(activeShare)}
                                    >
                                        <FiTrash2 size={14} />
                                        Delete
                                    </button>
                                </div>
                            </div>

                            {viewMode === "grid" && activeShare.files.length > 0 && (
                                <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", marginBottom: "16px" }}>
                                    <input 
                                        type="checkbox" 
                                        ref={(el) => {
                                            if (el) {
                                                const allSelected = activeShare.files.length > 0 && activeShare.files.every(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`));
                                                const someSelected = activeShare.files.some(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`));
                                                el.indeterminate = !allSelected && someSelected;
                                            }
                                        }}
                                        checked={activeShare.files.length > 0 && activeShare.files.every(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`))}
                                        onChange={() => {
                                            const allSelected = activeShare.files.length > 0 && activeShare.files.every(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`));
                                            setSelectedSharedIds(prev => {
                                                const next = new Set(prev);
                                                activeShare.files.forEach(f => {
                                                    const fileId = `${activeShare.id}:${f.storagePath}`;
                                                    if (allSelected) next.delete(fileId);
                                                    else next.add(fileId);
                                                });
                                                return next;
                                            });
                                        }}
                                        className="minimal-checkbox"
                                    />
                                    <span style={{ fontSize: "0.8rem", color: "var(--text-primary)", fontWeight: 500 }}>Select All</span>
                                    {activeShare.files.some(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`)) && (
                                        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                                            {activeShare.files.filter(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`)).length} Selected
                                        </span>
                                    )}
                                </div>
                            )}

                            {renderListHeader({
                                isAllSelected: activeShare.files.length > 0 && activeShare.files.every(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`)),
                                isPartiallySelected: activeShare.files.some(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`)) && !activeShare.files.every(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`)),
                                onToggleSelectAll: () => {
                                    const allSelected = activeShare.files.length > 0 && activeShare.files.every(f => selectedSharedIds.has(`${activeShare.id}:${f.storagePath}`));
                                    setSelectedSharedIds(prev => {
                                        const next = new Set(prev);
                                        activeShare.files.forEach(f => {
                                            const fileId = `${activeShare.id}:${f.storagePath}`;
                                            if (allSelected) next.delete(fileId);
                                            else next.add(fileId);
                                        });
                                        return next;
                                    });
                                },
                                hasItems: activeShare.files.length > 0
                            })}
                            <div className={`file-grid ${viewMode === "list" ? "list-view" : ""}`}>
                                {getSortedShareFiles(activeShare.files).map((fileEntry, idx) => {
                                    const isFileImage = isImageFile(fileEntry.path, fileEntry.type);
                                    const fileId = `${activeShare.id}:${fileEntry.storagePath}`;
                                    return (
                                        <div
                                            key={idx}
                                            className="file-card"
                                            title={fileEntry.path}
                                            onClick={() => {
                                                if (selectedSharedIds.size > 0) {
                                                    setSelectedSharedIds(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(fileId)) next.delete(fileId);
                                                        else next.add(fileId);
                                                        return next;
                                                    });
                                                } else {
                                                    void handleSharedFileEntryClick(activeShare, fileEntry);
                                                }
                                            }}
                                            onContextMenu={(e) => handleContextMenu(e, { id: fileId, name: fileEntry.path, isFolder: false, sharedItem: activeShare, sharedFileEntry: fileEntry })}
                                            onTouchStart={(e) => handleTouchStart(e, { id: fileId, name: fileEntry.path, isFolder: false, sharedItem: activeShare, sharedFileEntry: fileEntry })}
                                            onTouchEnd={handleTouchEnd}
                                            onTouchMove={handleTouchMove}
                                        >
                                            <div className="file-card-visual">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedSharedIds.has(fileId)} 
                                                    onChange={() => {
                                                        setSelectedSharedIds(prev => {
                                                            const next = new Set(prev);
                                                            if (next.has(fileId)) next.delete(fileId);
                                                            else next.add(fileId);
                                                            return next;
                                                        });
                                                    }} 
                                                    onClick={(e) => e.stopPropagation()} 
                                                    className="minimal-checkbox"
                                                />
                                                <div className="file-card-icon">
                                                    {loadingFileId === fileId ? (
                                                        <FiLoader size={16} className="spin" style={{ color: "var(--accent)" }} />
                                                    ) : isFileImage ? (
                                                        <SharedImageThumbnail share={activeShare} fileEntry={fileEntry} />
                                                    ) : (
                                                        getSharedItemIcon(fileEntry.path, false, undefined, fileEntry.type)
                                                    )}
                                                </div>
                                            </div>
                                            <div className="file-card-info">
                                                <span className="file-name" style={{ fontWeight: 'normal' }}>{fileEntry.path}</span>
                                                <span className="file-col file-date">{formatDateModified(activeShare.createdAt)}</span>
                                                <span className="file-col file-type">{getFileTypeLabel(fileEntry.path, false, fileEntry.type)}</span>
                                                <span className="file-col file-size">{formatSize(fileEntry.size)}</span>
                                            </div>
                                            <div 
                                                className="file-actions" 
                                                onClick={(e) => { 
                                                    e.stopPropagation(); 
                                                    handleContextMenu(e, { id: fileId, name: fileEntry.path, isFolder: false, sharedItem: activeShare, sharedFileEntry: fileEntry }); 
                                                }}
                                            >
                                                <button title="Options">
                                                    <FiMoreHorizontal size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()
            ) : loading ? (
                <div style={{ textAlign: "center", padding: "40px" }}>
                    <div className="spin" style={{ display: "inline-block", border: "3px solid var(--border-color)", borderTopColor: "var(--accent)", borderRadius: "50%", width: "24px", height: "24px" }} />
                </div>
            ) : folders.length === 0 && files.length === 0 && currentFolderId !== null ? (
                <div className="empty-state">
                    <FiFolder size={48} style={{ color: "var(--text-muted)", marginBottom: "16px" }} />
                    <p>This folder is empty.</p>
                </div>
            ) : (
                <>
                    {renderListHeader({
                        isAllSelected: (selectedFiles.size === files.length && selectedFolders.size === folders.length && (files.length > 0 || folders.length > 0)),
                        isPartiallySelected: ((selectedFiles.size > 0 || selectedFolders.size > 0) && !(selectedFiles.size === files.length && selectedFolders.size === folders.length)),
                        onToggleSelectAll: handleSelectAll,
                        hasItems: folders.length > 0 || files.length > 0
                    })}
                    <div className={`file-grid ${viewMode === "list" ? "list-view" : ""}`}>
                        {currentFolderId === null && (
                            <div 
                                className="file-card"
                                onClick={() => {
                                    if (selectedFiles.size > 0 || selectedFolders.size > 0) return;
                                    navigateToFolder("__shared__", "Shared with Me");
                                }}
                                style={{ borderColor: "var(--border-color)", outline: "none" }}
                            >
                                <div className="file-card-visual">
                                    {viewMode === "list" && <div style={{ width: 15, height: 15, flexShrink: 0 }} />}
                                    <div className="file-card-icon" style={{ color: "var(--accent)" }}>
                                        <FiUsers size={18} />
                                    </div>
                                </div>
                                <div className="file-card-info">
                                    <span className="file-name" style={{ fontWeight: 'normal' }}>Shared with Me</span>
                                    <span className="file-col file-date">-</span>
                                    <span className="file-col file-type">File folder</span>
                                    <span className="file-col file-size">
                                        {viewMode === "list" ? "" : `${sharedItems.length} item${sharedItems.length === 1 ? "" : "s"}`}
                                    </span>
                                </div>
                                <div className="file-actions" onClick={(e) => { e.stopPropagation(); navigateToFolder("__shared__", "Shared with Me"); }}>
                                    <button title="Open">
                                        <FiChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        )}
                        {sortedFolders.map(folder => (
                            <div 
                                key={folder.id} 
                                className="file-card" 
                                onClick={() => {
                                    if (selectedFiles.size > 0 || selectedFolders.size > 0) {
                                        handleToggleFolderSelection(folder.id);
                                    } else {
                                        navigateToFolder(folder.id, folder.name);
                                    }
                                }}
                                onContextMenu={(e) => handleContextMenu(e, { id: folder.id, name: folder.name, isFolder: true })}
                                onTouchStart={(e) => handleTouchStart(e, { id: folder.id, name: folder.name, isFolder: true })}
                                onTouchEnd={handleTouchEnd}
                                onTouchMove={handleTouchMove}
                            >
                                <div className="file-card-visual">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedFolders.has(folder.id)} 
                                        onChange={() => handleToggleFolderSelection(folder.id)} 
                                        onClick={(e) => e.stopPropagation()} 
                                        className="minimal-checkbox"
                                    />
                                    <div className="file-card-icon">
                                        <FiFolder 
                                            size={18} 
                                            style={{ color: folder.color ? "transparent" : "var(--text-primary)" }}
                                            fill={folder.color ? `url(#gradient-${folder.color})` : "none"}
                                        />
                                    </div>
                                </div>
                                <div className="file-card-info">
                                    <span className="file-name" style={{ fontWeight: 'normal' }}>{folder.name}</span>
                                    <span className="file-col file-date">{formatDateModified(folder.updatedAt || folder.createdAt)}</span>
                                    <span className="file-col file-type">File folder</span>
                                    <span className="file-col file-size">
                                        {viewMode === "list" 
                                            ? "" 
                                            : (folderCounts[folder.id] !== undefined 
                                                ? `${folderCounts[folder.id]} item${folderCounts[folder.id] !== 1 ? 's' : ''}` 
                                                : "Loading...")}
                                    </span>
                                </div>
                                <div className="file-actions" onClick={(e) => { e.stopPropagation(); handleContextMenu(e, { id: folder.id, name: folder.name, isFolder: true }); }}>
                                    <button title="Options">
                                        <FiMoreHorizontal size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {sortedFiles.map(file => (
                            <div 
                                key={file.id} 
                                className="file-card"
                                onClick={() => {
                                    if (selectedFiles.size > 0 || selectedFolders.size > 0) {
                                        handleToggleFileSelection(file.id);
                                    } else {
                                        handleFileClick(file);
                                    }
                                }}
                                onContextMenu={(e) => handleContextMenu(e, { id: file.id, name: file.name, isFolder: false, file })}
                                onTouchStart={(e) => handleTouchStart(e, { id: file.id, name: file.name, isFolder: false, file })}
                                onTouchEnd={handleTouchEnd}
                                onTouchMove={handleTouchMove}
                            >
                                <div className="file-card-visual">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedFiles.has(file.id)} 
                                        onChange={() => handleToggleFileSelection(file.id)} 
                                        onClick={(e) => e.stopPropagation()} 
                                        className="minimal-checkbox"
                                    />
                                    <div className="file-card-icon">
                                        {loadingFileId === file.id ? (
                                            <FiLoader size={16} className="spin" style={{ color: "var(--accent)" }} />
                                        ) : (
                                            isImageFile(file.name, file.type) ? <ImageThumbnail file={file} /> : getFileIcon(file)
                                        )}
                                    </div>
                                </div>
                                <div className="file-card-info">
                                    <span className="file-name" style={{ fontWeight: 'normal' }}>{file.name}</span>
                                    <span className="file-col file-date">{formatDateModified(file.updatedAt || file.createdAt)}</span>
                                    <span className="file-col file-type">{getFileTypeLabel(file.name, false, file.type)}</span>
                                    <span className="file-col file-size">{formatSize(file.size)}</span>
                                </div>
                                <div className="file-actions" onClick={(e) => { e.stopPropagation(); handleContextMenu(e, { id: file.id, name: file.name, isFolder: false, file }); }}>
                                    <button title="Options">
                                        <FiMoreHorizontal size={18} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {contextMenu && (
                <div 
                    className="context-menu" 
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {contextMenu.target.sharedItem ? (
                        <>
                            <button 
                                className="context-menu-item" 
                                onClick={() => { 
                                    const share = contextMenu.target.sharedItem!;
                                    const entry = contextMenu.target.sharedFileEntry;
                                    if (entry) {
                                        void handleDownloadSharedFile(share, entry);
                                    } else if (share.itemType === "file" && share.files[0]) {
                                        void handleDownloadSharedFile(share, share.files[0]);
                                    } else {
                                        void handleDownloadAllShared(share);
                                    }
                                    setContextMenu(null); 
                                }}
                            >
                                <FiDownload /> Download
                            </button>
                            <button className="context-menu-item" onClick={() => { 
                                setRenameTarget(contextMenu.target); 
                                setNewName(contextMenu.target.isFolder ? contextMenu.target.name : getNameWithoutExtension(contextMenu.target.name)); 
                                setRenameModalOpen(true); 
                                setContextMenu(null); 
                            }}>
                                <FiEdit2 /> Rename
                            </button>
                            <button className="context-menu-item" onClick={() => { setMoveTarget(contextMenu.target); setContextMenu(null); }}>
                                <FiCornerUpRight /> Move
                            </button>
                            <button className="context-menu-item" onClick={() => { handleShareTarget(contextMenu.target); setContextMenu(null); }}>
                                <FiShare2 /> Share
                            </button>
                            {contextMenu.target.isFolder && (
                                <button className="context-menu-item" onClick={() => { setColorPickerTarget({ id: contextMenu.target.id, name: contextMenu.target.name, sharedItem: contextMenu.target.sharedItem }); setContextMenu(null); }}>
                                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'linear-gradient(135deg, #ffd1dc, #ffdfba, #bae1ff)' }} /> Color
                                </button>
                            )}
                            <button 
                                className="context-menu-item danger" 
                                onClick={() => { 
                                    setConfirmRemoveShare(contextMenu.target.sharedItem!); 
                                    setContextMenu(null); 
                                }}
                            >
                                <FiTrash2 /> Delete
                            </button>
                        </>
                    ) : (
                        <>
                            {!contextMenu.target.isFolder && (
                                <button className="context-menu-item" onClick={() => { handleDownload(contextMenu.target.file!); setContextMenu(null); }}>
                                    {loadingFileId === contextMenu.target.id ? <FiLoader className="spin" /> : <FiDownload />} Download
                                </button>
                            )}
                            <button className="context-menu-item" onClick={() => { 
                                setRenameTarget(contextMenu.target); 
                                setNewName(contextMenu.target.isFolder ? contextMenu.target.name : getNameWithoutExtension(contextMenu.target.name)); 
                                setRenameModalOpen(true); 
                                setContextMenu(null); 
                            }}>
                                <FiEdit2 /> Rename
                            </button>
                            <button className="context-menu-item" onClick={() => { setMoveTarget(contextMenu.target); setContextMenu(null); }}>
                                <FiCornerUpRight /> Move
                            </button>
                            <button className="context-menu-item" onClick={() => { handleShareTarget(contextMenu.target); setContextMenu(null); }}>
                                <FiShare2 /> Share
                            </button>
                            {contextMenu.target.isFolder && (
                                <button className="context-menu-item" onClick={() => { setColorPickerTarget({ id: contextMenu.target.id, name: contextMenu.target.name }); setContextMenu(null); }}>
                                    <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'linear-gradient(135deg, #ffd1dc, #ffdfba, #bae1ff)' }} /> Color
                                </button>
                            )}
                            <button className="context-menu-item danger" onClick={() => { setDeleteTarget(contextMenu.target); setContextMenu(null); }}>
                                <FiTrash2 /> Delete
                            </button>
                        </>
                    )}
                </div>
            )}

            <FolderPickerModal
                isOpen={moveTarget !== null}
                onClose={() => setMoveTarget(null)}
                onSelect={(folderId) => handleMove(folderId)}
                currentFolderId={currentFolderId}
                movingFolderIds={moveTarget?.isFolder ? [moveTarget.id] : []}
                actionLoading={actionLoading}
            />

            <FolderPickerModal
                isOpen={bulkMoveModalOpen}
                onClose={() => setBulkMoveModalOpen(false)}
                onSelect={(folderId) => handleBulkMove(folderId)}
                currentFolderId={currentFolderId}
                movingFolderIds={Array.from(selectedFolders)}
                actionLoading={actionLoading}
            />

            <FolderPickerModal
                isOpen={bulkMoveSharedModalOpen}
                onClose={() => setBulkMoveSharedModalOpen(false)}
                onSelect={(folderId) => handleBulkMoveShared(folderId)}
                currentFolderId={currentFolderId}
                movingFolderIds={[]}
                actionLoading={actionLoading}
            />

            {(selectedFiles.size > 0 || selectedFolders.size > 0) && (
                <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-secondary)', padding: '12px 24px', borderRadius: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', gap: '20px', alignItems: 'center', zIndex: 100, border: '1px solid var(--border-color)' }}>
                    <button onClick={handleBulkDownload} disabled={actionLoading} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                        {loadingBulkAction === 'download' ? <FiLoader size={16} className="spin" /> : <FiDownload size={16} />} Download
                    </button>
                    <button onClick={() => setBulkMoveModalOpen(true)} disabled={actionLoading} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                        {loadingBulkAction === 'move' ? <FiLoader size={16} className="spin" /> : <FiCornerUpRight size={16} />} Move
                    </button>
                    <button onClick={handleBulkShare} disabled={actionLoading} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                        <FiShare2 size={16} /> Share
                    </button>
                    <button onClick={() => setBulkDeleteModalOpen(true)} disabled={actionLoading} style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                        {loadingBulkAction === 'delete' ? <FiLoader size={16} className="spin" /> : <FiTrash2 size={16} />} Delete
                    </button>
                    <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
                    <button onClick={() => { setSelectedFiles(new Set()); setSelectedFolders(new Set()); }} disabled={actionLoading} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                        <FiX size={16} /> Clear
                    </button>
                </div>
            )}

            {selectedSharedIds.size > 0 && (
                <div style={{ position: 'fixed', bottom: 30, left: '50%', transform: 'translateX(-50%)', background: 'var(--bg-secondary)', padding: '12px 24px', borderRadius: '30px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', display: 'flex', gap: '20px', alignItems: 'center', zIndex: 100, border: '1px solid var(--border-color)' }}>
                    <button 
                        onClick={handleBulkDownloadShared} 
                        disabled={actionLoading} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}
                    >
                        <FiDownload size={16} /> Download
                    </button>
                    <button 
                        onClick={() => setBulkMoveSharedModalOpen(true)} 
                        disabled={actionLoading} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}
                    >
                        <FiCornerUpRight size={16} /> Move
                    </button>
                    <button 
                        onClick={handleBulkShareShared} 
                        disabled={actionLoading} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}
                    >
                        <FiShare2 size={16} /> Share
                    </button>
                    <button 
                        onClick={handleBulkDeleteShared} 
                        disabled={actionLoading} 
                        style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}
                    >
                        <FiTrash2 size={16} /> Delete
                    </button>
                    <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
                    <button onClick={() => setSelectedSharedIds(new Set())} disabled={actionLoading} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.9rem', fontWeight: 500 }}>
                        <FiX size={16} /> Clear
                    </button>
                </div>
            )}

            {/* Color Picker Modal */}
            {colorPickerTarget && (
                <div className="modal-overlay" onClick={() => setColorPickerTarget(null)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <h3>Folder Color</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            Select a color for <strong>{colorPickerTarget.name}</strong>
                        </p>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '24px', flexWrap: 'wrap', maxWidth: '300px', margin: '0 auto 24px auto' }}>
                            {gradientColorsList.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => handleColorChange(c.id)}
                                    disabled={loadingColor !== null}
                                    style={{
                                        width: '32px', height: '32px', borderRadius: '50%',
                                        background: gradientColors[c.id],
                                        border: '1px solid var(--border-color)',
                                        cursor: 'pointer',
                                        transition: 'transform 0.2s ease',
                                        padding: 0,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                    title={c.name}
                                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
                                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    {loadingColor === c.id && <FiLoader size={16} className="spin" style={{ color: '#fff' }} />}
                                </button>
                            ))}
                        </div>
                        <div className="confirm-actions">
                            <button type="button" className="btn-secondary" onClick={() => handleColorChange("")} disabled={loadingColor !== null} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {loadingColor === "reset" && <FiLoader size={14} className="spin" />}
                                Reset
                            </button>
                            <button type="button" className="btn-secondary" onClick={() => setColorPickerTarget(null)} disabled={loadingColor !== null}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* New Folder Modal */}
            {newFolderModalOpen && (
                <div className="modal-overlay" onClick={() => setNewFolderModalOpen(false)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <h3>New Folder</h3>
                        <form onSubmit={handleCreateFolder}>
                            <div className="form-group" style={{ marginBottom: '18px', marginTop: '12px' }}>
                                <input type="text" placeholder="Folder Name" value={newFolderName} onChange={e => setNewFolderName(e.target.value)} autoFocus required style={{ paddingLeft: '12px' }} />
                            </div>
                            <div className="confirm-actions">
                                <button type="button" className="btn-secondary" onClick={() => setNewFolderModalOpen(false)} disabled={actionLoading}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary" disabled={actionLoading || !newFolderName.trim()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {actionLoading ? <><FiLoader size={16} className="spin" /> Creating...</> : "Create"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Rename Modal */}
            {renameModalOpen && (
                <div className="modal-overlay" onClick={() => setRenameModalOpen(false)}>
                    <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                        <h3>Rename</h3>
                        <form onSubmit={handleRename}>
                            <div className="form-group" style={{ marginBottom: '18px', marginTop: '12px' }}>
                                <input type="text" placeholder="New Name" value={newName} onChange={e => setNewName(e.target.value)} autoFocus required style={{ paddingLeft: '12px' }} />
                            </div>
                            <div className="confirm-actions">
                                <button type="button" className="btn-secondary" onClick={() => setRenameModalOpen(false)} disabled={actionLoading}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-primary" disabled={actionLoading || !newName.trim()} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {actionLoading ? <><FiLoader size={16} className="spin" /> Saving...</> : "Save"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <ConfirmDialog
                isOpen={!!deleteTarget}
                title={`Delete ${deleteTarget?.isFolder ? 'Folder' : 'File'}`}
                message={<>Are you sure you want to delete <strong>"{deleteTarget?.name}"</strong>? This action cannot be undone.</>}
                onConfirm={handleDelete}
                onCancel={() => setDeleteTarget(null)}
                loading={actionLoading}
            />

            {duplicatePrompt && (
                <div className="modal-overlay" onClick={() => duplicatePrompt.resolve('skip')}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3>File Already Exists</h3><br></br>
                        <p>A file named <strong>"{duplicatePrompt.fileName}"</strong> already exists in this folder.</p>
                        <p>What would you like to do?</p>
                        <div className="confirm-actions" style={{ flexDirection: 'column', gap: '8px', marginTop: '20px' }}>
                            <button className="btn-primary" onClick={() => duplicatePrompt.resolve('replace')} style={{ width: '100%' }}>
                                Replace Existing File
                            </button>
                            <button className="btn-secondary" onClick={() => duplicatePrompt.resolve('keep')} style={{ width: '100%', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                                Keep Both (Rename New File)
                            </button>
                            <button className="btn-secondary" onClick={() => duplicatePrompt.resolve('skip')} style={{ width: '100%' }}>
                                Skip This File
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {selectedImage && (
                <div className="image-viewer-modal" onClick={() => {
                    if (Date.now() - lastDragTime.current < 100) return;
                    if (imageMenuOpen) {
                        setImageMenuOpen(false);
                        return;
                    }
                    setSelectedImage(null);
                    setZoomLevel(1);
                    setPan({x:0, y:0});
                }}>
                    <div className="image-viewer-header" onClick={(e) => { 
                        e.stopPropagation(); 
                        if (imageMenuOpen) setImageMenuOpen(false); 
                    }}>
                        <div className="image-viewer-title">{selectedImage.file.name}</div>
                        
                        <div className="image-viewer-actions desktop-only">
                            {isPreviewHeaderZoomSupported(selectedImage) && (
                                <>
                                    <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.35, 5))} title="Zoom In"><FiZoomIn /></button>
                                    <button onClick={() => { setZoomLevel(prev => Math.max(prev - 0.35, 0.35)); setPan({x:0, y:0}); }} title="Zoom Out"><FiZoomOut /></button>
                                    <button onClick={() => { setZoomLevel(1); setPan({ x: 0, y: 0 }); }} title="Reset Zoom"><FiMaximize /></button>
                                    <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)", margin: "0 8px" }} />
                                </>
                            )}

                            <button 
                                onClick={() => handleDownload(selectedImage.file)}
                                disabled={loadingFileId === selectedImage.file.id}
                            >
                                {loadingFileId === selectedImage.file.id ? (
                                    <><FiLoader className="spin" /> Downloading...</>
                                ) : (
                                    <><FiDownload /> Download</>
                                )}
                            </button>
                            <button onClick={() => { 
                                if (selectedImage.sharedItem) {
                                    setRenameTarget({
                                        id: selectedImage.file.id,
                                        name: selectedImage.file.name,
                                        isFolder: false,
                                        sharedItem: selectedImage.sharedItem,
                                        sharedFileEntry: selectedImage.sharedFileEntry,
                                    });
                                } else {
                                    setRenameTarget({id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false}); 
                                }
                                setNewName(getNameWithoutExtension(selectedImage.file.name)); 
                                setRenameModalOpen(true); 
                            }}><FiEdit2 /> Rename</button>
                            <button onClick={() => { 
                                if (selectedImage.sharedItem) {
                                    setMoveTarget({
                                        id: selectedImage.file.id,
                                        name: selectedImage.file.name,
                                        isFolder: false,
                                        sharedItem: selectedImage.sharedItem,
                                        sharedFileEntry: selectedImage.sharedFileEntry,
                                    });
                                } else {
                                    setMoveTarget({id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false}); 
                                }
                            }}><FiCornerUpRight /> Move</button>
                            <button onClick={() => { 
                                if (selectedImage.sharedItem) {
                                    handleShareTarget({
                                        id: selectedImage.file.id,
                                        name: selectedImage.file.name,
                                        isFolder: false,
                                        sharedItem: selectedImage.sharedItem,
                                        sharedFileEntry: selectedImage.sharedFileEntry,
                                    });
                                } else {
                                    setItemsToShare([{ kind: "file", file: selectedImage.file }]); 
                                    setShareModalOpen(true); 
                                }
                            }}><FiShare2 /> Share</button>
                            <button className="danger" onClick={() => { 
                                if (selectedImage.sharedItem) {
                                    setConfirmRemoveShare(selectedImage.sharedItem);
                                } else {
                                    setDeleteTarget({ id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false, file: selectedImage.file }); 
                                }
                            }}><FiTrash2 /> Delete</button>
                            <button className="close-btn" onClick={() => { setSelectedImage(null); setZoomLevel(1); setPan({x:0, y:0}); }}><FiX size={24} /></button>
                        </div>
                        
                        <div className="image-viewer-actions mobile-only">
                            {isPreviewHeaderZoomSupported(selectedImage) && (
                                <>
                                    <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.35, 5))} title="Zoom In" style={{ padding: "8px" }}><FiZoomIn size={20} /></button>
                                    <button onClick={() => { setZoomLevel(prev => Math.max(prev - 0.35, 0.35)); setPan({x:0, y:0}); }} title="Zoom Out" style={{ padding: "8px" }}><FiZoomOut size={20} /></button>
                                    <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.2)", margin: "0 4px" }} />
                                </>
                            )}
                            <button className="ellipsis-btn" onClick={(e) => { e.stopPropagation(); setImageMenuOpen(!imageMenuOpen); }}>
                                {loadingFileId === selectedImage.file.id ? <FiLoader size={24} className="spin" /> : <FiMoreHorizontal size={24} />}
                            </button>
                            <button className="close-btn" onClick={() => { setSelectedImage(null); setZoomLevel(1); setPan({x:0, y:0}); }}><FiX size={24} /></button>
                            
                            {imageMenuOpen && (
                                <div className="image-viewer-dropdown">

                                    <button 
                                        onClick={() => { handleDownload(selectedImage.file); setImageMenuOpen(false); }}
                                        disabled={loadingFileId === selectedImage.file.id}
                                    >
                                        {loadingFileId === selectedImage.file.id ? (
                                            <><FiLoader size={16} className="spin" /> Downloading...</>
                                        ) : (
                                            <><FiDownload /> Download</>
                                        )}
                                    </button>
                                    <button onClick={() => { 
                                        if (selectedImage.sharedItem) {
                                            setRenameTarget({
                                                id: selectedImage.file.id,
                                                name: selectedImage.file.name,
                                                isFolder: false,
                                                sharedItem: selectedImage.sharedItem,
                                                sharedFileEntry: selectedImage.sharedFileEntry,
                                            });
                                        } else {
                                            setRenameTarget({id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false}); 
                                        }
                                        setNewName(getNameWithoutExtension(selectedImage.file.name)); 
                                        setRenameModalOpen(true); 
                                        setImageMenuOpen(false); 
                                    }}><FiEdit2 /> Rename</button>
                                    <button onClick={() => { 
                                        if (selectedImage.sharedItem) {
                                            setMoveTarget({
                                                id: selectedImage.file.id,
                                                name: selectedImage.file.name,
                                                isFolder: false,
                                                sharedItem: selectedImage.sharedItem,
                                                sharedFileEntry: selectedImage.sharedFileEntry,
                                            });
                                        } else {
                                            setMoveTarget({id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false}); 
                                        }
                                        setImageMenuOpen(false); 
                                    }}><FiCornerUpRight /> Move</button>
                                    <button onClick={() => { 
                                        if (selectedImage.sharedItem) {
                                            handleShareTarget({
                                                id: selectedImage.file.id,
                                                name: selectedImage.file.name,
                                                isFolder: false,
                                                sharedItem: selectedImage.sharedItem,
                                                sharedFileEntry: selectedImage.sharedFileEntry,
                                            });
                                        } else {
                                            setItemsToShare([{ kind: "file", file: selectedImage.file }]); 
                                            setShareModalOpen(true); 
                                        }
                                        setImageMenuOpen(false); 
                                    }}><FiShare2 /> Share</button>
                                    <button className="danger" onClick={() => { 
                                        if (selectedImage.sharedItem) {
                                            setConfirmRemoveShare(selectedImage.sharedItem);
                                        } else {
                                            setDeleteTarget({ id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false, file: selectedImage.file }); 
                                        }
                                        setImageMenuOpen(false); 
                                    }}><FiTrash2 /> Delete</button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div 
                        className="image-viewer-content" 
                        style={{ 
                            padding: (selectedImage.file.type === 'application/pdf' || isOfficeFile(selectedImage.file.type)) ? 0 : undefined,
                            background: (selectedImage.file.type === 'application/pdf' || isOfficeFile(selectedImage.file.type)) ? '#ffffff' : undefined
                        }}
                        onClick={(e) => {
                            if (selectedImage.file.type === 'application/pdf' || isOfficeFile(selectedImage.file.type)) {
                                e.stopPropagation();
                                if (imageMenuOpen) setImageMenuOpen(false);
                            }
                        }}
                        onWheel={(e) => {
                            if (!isPreviewMediaZoomable(selectedImage)) return;
                            if (e.ctrlKey || e.metaKey) {
                                if (e.deltaY < 0) {
                                    setZoomLevel(prev => Math.min(prev + 0.25, 5));
                                } else {
                                    setZoomLevel(prev => {
                                        const newZoom = Math.max(prev - 0.25, 0.5);
                                        if (newZoom <= 1) setPan({x: 0, y: 0});
                                        return newZoom;
                                    });
                                }
                            } else if (zoomLevel > 1) {
                                setPan(prev => {
                                    let newX = prev.x - e.deltaX;
                                    let newY = prev.y - e.deltaY;
                                    if (imageRef.current) {
                                        const w = imageRef.current.clientWidth * zoomLevel;
                                        const h = imageRef.current.clientHeight * zoomLevel;
                                        const boundaryMult = window.innerWidth <= 768 ? 0.45 : 0.25;
                                        const maxDragX = w * boundaryMult + window.innerWidth / 2;
                                        const maxDragY = h * boundaryMult + window.innerHeight / 2;
                                        newX = Math.max(-maxDragX, Math.min(maxDragX, newX));
                                        newY = Math.max(-maxDragY, Math.min(maxDragY, newY));
                                    }
                                    return { x: newX, y: newY };
                                });
                            }
                        }}
                    >
                        <div
                            ref={imageRef}
                            className="image-viewer-zoom-wrapper"
                            onPointerDown={(e) => {
                                if (e.pointerType === 'touch' || !isPreviewMediaZoomable(selectedImage)) return;
                                if (zoomLevel <= 1) return;
                                setIsDragging(true);
                                lastPanPos.current = { x: e.clientX, y: e.clientY };
                                e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                                if (e.pointerType === 'touch' || !isPreviewMediaZoomable(selectedImage) || !isDragging) return;
                                const dx = e.clientX - lastPanPos.current.x;
                                const dy = e.clientY - lastPanPos.current.y;
                                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) lastDragTime.current = Date.now();
                                setPan(prev => {
                                    let newX = prev.x + dx;
                                    let newY = prev.y + dy;
                                    if (imageRef.current) {
                                        const w = imageRef.current.clientWidth * zoomLevel;
                                        const h = imageRef.current.clientHeight * zoomLevel;
                                        const boundaryMult = window.innerWidth <= 768 ? 0.45 : 0.25;
                                        const maxDragX = w * boundaryMult + window.innerWidth / 2;
                                        const maxDragY = h * boundaryMult + window.innerHeight / 2;
                                        newX = Math.max(-maxDragX, Math.min(maxDragX, newX));
                                        newY = Math.max(-maxDragY, Math.min(maxDragY, newY));
                                    }
                                    return { x: newX, y: newY };
                                });
                                lastPanPos.current = { x: e.clientX, y: e.clientY };
                            }}
                            onPointerUp={(e) => {
                                if (e.pointerType === 'touch' || !isPreviewMediaZoomable(selectedImage)) return;
                                setIsDragging(false);
                                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                    e.currentTarget.releasePointerCapture(e.pointerId);
                                }
                            }}
                            onPointerCancel={(e) => {
                                if (e.pointerType === 'touch' || !isPreviewMediaZoomable(selectedImage)) return;
                                setIsDragging(false);
                                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                    e.currentTarget.releasePointerCapture(e.pointerId);
                                }
                            }}
                            style={{
                                transform: isPreviewMediaZoomable(selectedImage) ? `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})` : undefined,
                                transition: isDragging || isTouchInteracting ? 'none' : 'transform 0.1s ease-out',
                                cursor: zoomLevel > 1 && isPreviewMediaZoomable(selectedImage) ? (isDragging ? "grabbing" : "grab") : "default",
                                width: '100%',
                                height: '100%',
                                flex: 1,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                touchAction: isPreviewMediaZoomable(selectedImage) ? 'none' : 'pan-x pan-y'
                            }}
                        >
                            {selectedImage.file.type.startsWith('image/') ? (
                                <img 
                                    src={selectedImage.url} 
                                    alt={selectedImage.file.name} 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if (imageMenuOpen) setImageMenuOpen(false); 
                                    }} 
                                    draggable={false}
                                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                                />
                        ) : selectedImage.file.type === 'application/pdf' ? (
                            <PDFEditor 
                                url={selectedImage.pdfData ? { data: selectedImage.pdfData } : selectedImage.url}
                                onContainerClick={() => { if (imageMenuOpen) setImageMenuOpen(false); }}
                            />
                        ) : selectedImage.file.type.startsWith('video/') ? (
                            <video src={selectedImage.url} controls playsInline style={{ maxWidth: '100%', maxHeight: '100%' }} />
                        ) : selectedImage.file.type.startsWith('audio/') ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', width: '100%' }}>
                                <FiMusic size={48} style={{ color: 'var(--text-secondary)' }} />
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{selectedImage.file.name}</p>
                                <audio src={selectedImage.url} controls style={{ maxWidth: '100%', width: '320px' }} />
                            </div>
                        ) : isOfficeFile(selectedImage.file.type) ? (
                            isDocxFile(selectedImage.file.type) ? (
                                <div
                                    ref={scrollContainerRef}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        flex: 1,
                                        overflow: 'auto',
                                        WebkitOverflowScrolling: 'touch',
                                        touchAction: 'pan-x pan-y',
                                        background: '#e6e6e6',
                                        color: '#000',
                                        borderRadius: 'var(--radius-md)',
                                        display: 'block',
                                    }}
                                >
                                    <div
                                        style={{
                                            margin: '0 auto',
                                            width: 'max-content',
                                            minWidth: '100%',
                                            transform: docPinchScale !== 1 ? `scale(${docPinchScale})` : undefined,
                                            transformOrigin: 'top left',
                                        }}
                                    >
                                        <div
                                            ref={officeContainerRef}
                                            onClick={(e) => { e.stopPropagation(); if (imageMenuOpen) setImageMenuOpen(false); }}
                                            className="office-document-container"
                                            style={{ zoom: zoomLevel } as any}
                                        />
                                    </div>
                                </div>
                            ) : isExcelFile(selectedImage.file.type) && selectedImage.excelHtml ? (
                                <div
                                    ref={scrollContainerRef}
                                    onClick={(e) => { e.stopPropagation(); if (imageMenuOpen) setImageMenuOpen(false); }}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        flex: 1,
                                        overflow: 'auto',
                                        WebkitOverflowScrolling: 'touch',
                                        touchAction: 'pan-x pan-y',
                                        background: '#ffffff',
                                        color: '#000',
                                        borderRadius: 'var(--radius-md)',
                                        padding: '20px',
                                        display: 'block',
                                    }}
                                >
                                    <div
                                        style={{
                                            margin: '0 auto',
                                            width: 'max-content',
                                            transform: docPinchScale !== 1 ? `scale(${docPinchScale})` : undefined,
                                            transformOrigin: 'top left',
                                        }}
                                    >
                                        <div
                                            className="excel-preview-wrapper"
                                            style={{ zoom: zoomLevel } as any}
                                            dangerouslySetInnerHTML={{ __html: selectedImage.excelHtml }}
                                        />
                                    </div>
                                </div>
                            ) : isPptxFile(selectedImage.file.type) && selectedImage.pptxThumbnailUrl ? (
                                <img
                                    src={selectedImage.pptxThumbnailUrl}
                                    alt="Presentation Thumbnail"
                                    onClick={(e) => { e.stopPropagation(); if (imageMenuOpen) setImageMenuOpen(false); }}
                                    style={{
                                        maxWidth: '100%',
                                        maxHeight: '100%',
                                        objectFit: 'contain',
                                        borderRadius: 'var(--radius-md)',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
                                    }}
                                />
                            ) : (
                                <div onClick={(e) => { e.stopPropagation(); if (imageMenuOpen) setImageMenuOpen(false); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', width: '100%', padding: '32px' }}>
                                    <FiFileText size={64} style={{ color: '#666' }} />
                                    <p style={{ color: '#222', fontSize: '1.1rem', fontWeight: 500, textAlign: 'center' }}>{selectedImage.file.name}</p>
                                    <p style={{ color: '#666', fontSize: '0.85rem' }}>Preview is not available for this file type.</p>
                                    <button
                                        className="auth-submit"
                                        style={{ width: 'auto', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}
                                        onClick={() => handleDownload(selectedImage.file)}
                                        disabled={loadingFileId === selectedImage.file.id}
                                    >
                                        {loadingFileId === selectedImage.file.id ? (
                                            <><FiLoader className="spin" /> Downloading...</>
                                        ) : (
                                            <><FiDownload /> Download File</>
                                        )}
                                    </button>
                                </div>
                            )
                        ) : (
                            <div style={{ width: '100%', height: '100%', overflow: 'auto', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}>
                                <iframe 
                                    src={selectedImage.url} 
                                    sandbox="allow-same-origin allow-popups"
                                    onLoad={(e) => attachIframePinch(e.currentTarget)}
                                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 'var(--radius-md)', background: '#fff' }}
                                    title={selectedImage.file.name}
                                />
                            </div>
                        )}
                        </div>
                    </div>
                </div>
            )}
            {downloadPromptFile && (
                <div className="modal-overlay">
                    <div className="modal-content" style={{ maxWidth: '400px' }}>
                        <h3 style={{ marginTop: 0 }}>Download File</h3>
                        <p style={{ color: 'var(--text-secondary)' }}>
                            Preview is not available for <strong>{downloadPromptFile.name}</strong>. Would you like to download it?
                        </p>
                        
                        <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                            <button 
                                className="auth-submit" 
                                style={{ flex: 1, margin: 0 }}
                                onClick={() => {
                                    const file = downloadPromptFile;
                                    setDownloadPromptFile(null);
                                    handleDownload(file);
                                }}
                            >
                                <FiDownload style={{ marginRight: '6px' }} /> Download
                            </button>
                            
                            <button 
                                className="auth-submit" 
                                style={{ flex: 1, margin: 0, background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                                onClick={() => setDownloadPromptFile(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Bulk Delete Confirm Dialog */}
            <ConfirmDialog
                isOpen={bulkDeleteModalOpen}
                title={`Delete ${selectedFiles.size + selectedFolders.size} Item${selectedFiles.size + selectedFolders.size === 1 ? '' : 's'}`}
                message={<>Are you sure you want to delete <strong>{selectedFiles.size + selectedFolders.size} selected item{selectedFiles.size + selectedFolders.size === 1 ? '' : 's'}</strong>? This action cannot be undone.</>}
                onConfirm={confirmBulkDelete}
                onCancel={() => setBulkDeleteModalOpen(false)}
                loading={actionLoading}
            />

            {/* Share Modal */}
            <ShareModal
                isOpen={shareModalOpen}
                items={itemsToShare}
                onClose={() => setShareModalOpen(false)}
                onShared={() => void refreshShares()}
            />

            {/* Remove / Revoke Share Confirm Dialog */}
            <ConfirmDialog
                isOpen={!!confirmRemoveShare}
                title="Delete Shared Item"
                message={<>Are you sure you want to delete <strong>"{confirmRemoveShare?.name}"</strong>?</>}
                onConfirm={handleConfirmRemoveShare}
                onCancel={() => setConfirmRemoveShare(null)}
                loading={actionLoading}
            />
        </div>
    );
}
