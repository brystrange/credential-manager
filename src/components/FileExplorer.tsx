import { useState, useEffect, useRef } from "react";
import { useBlocker } from "react-router-dom";
import { 
    FiFolder, FiFile, FiUpload, FiPlus, FiTrash2, FiEdit2, FiDownload, 
    FiChevronRight, FiHome, FiX, FiFileText, FiImage, FiArchive,
    FiGrid, FiList, FiCornerUpRight, FiMoreHorizontal, FiLoader,
    FiZoomIn, FiZoomOut, FiMaximize, FiMusic, FiVideo
} from "react-icons/fi";
import { 
    subscribeToFolders, subscribeToFiles, createFolder, renameFolder, deleteFolder, 
    uploadVaultFile, downloadVaultFile, renameVaultFile, deleteVaultFile,
    moveFolder, moveVaultFile, getFolderItemCount, updateFolderColor
} from "../services/fileService";
import type { VaultFolder, VaultFile } from "../services/fileService";
import ConfirmDialog from "./ConfirmDialog";
import FolderPickerModal from "./FolderPickerModal";
import { useSubscription } from "../context/SubscriptionContext";
import { compressImage } from "../utils/imageCompressor";
import PDFEditor from "./PDFEditor";

const gradientColorsList = [
    { id: 'sunset-glow', name: 'Sunset Glow', start: '#fb7185', end: '#fb923c' },
    { id: 'neon-horizon', name: 'Neon Horizon', start: '#d946ef', end: '#06b6d4' },
    { id: 'mango-salsa', name: 'Mango Salsa', start: '#facc15', mid: '#f97316', end: '#ef4444' },
    { id: 'aurora-flare', name: 'Aurora Flare', start: '#2dd4bf', mid: '#3b82f6', end: '#9333ea' },
    { id: 'cherry-pop', name: 'Cherry Pop', start: '#f472b6', end: '#f43f5e' },
    { id: 'peach-silk', name: 'Peach Silk', start: '#ffedd5', end: '#fecdd3' },
    { id: 'mint-cloud', name: 'Mint Cloud', start: '#99f6e4', end: '#d9f99d' },
    { id: 'lavender-tea', name: 'Lavender Tea', start: '#f5d0fe', end: '#c7d2fe' },
    { id: 'arctic-ice', name: 'Arctic Ice', start: '#7dd3fc', end: '#a5b4fc' },
    { id: 'golden-sand', name: 'Golden Sand', start: '#fde68a', end: '#facc15' },
    { id: 'cyber-night', name: 'Cyber Night', start: '#0f172a', mid: '#581c87', end: '#0f172a' },
    { id: 'deep-ocean', name: 'Deep Ocean', start: '#2563eb', end: '#7c3aed' },
    { id: 'royal-velvet', name: 'Royal Velvet', start: '#7e22ce', end: '#a21caf' },
    { id: 'pine-forest', name: 'Pine Forest', start: '#047857', end: '#134e4a' },
    { id: 'steel-blade', name: 'Steel Blade', start: '#374151', end: '#111827' },
    { id: 'tropical-sunrise', name: 'Tropical Sunrise', start: '#ec4899', mid: '#eab308', end: '#14b8a6' },
    { id: 'cosmic-rift', name: 'Cosmic Rift', start: '#dc2626', mid: '#9333ea', end: '#2563eb' },
    { id: 'synthwave', name: 'Synthwave', start: '#06b6d4', mid: '#d946ef', end: '#f97316' },
    { id: 'earth-sky', name: 'Earth & Sky', start: '#15803d', mid: '#f59e0b', end: '#0ea5e9' },
    { id: 'atasha', name: 'Atasha Purple', start: '#e0b1cb', mid: '#be95c4', end: '#9f86c0' }
];

const gradientColors = gradientColorsList.reduce((acc, c) => {
    acc[c.id] = c.mid 
        ? `linear-gradient(135deg, ${c.start} 0%, ${c.mid} 50%, ${c.end} 100%)`
        : `linear-gradient(135deg, ${c.start} 0%, ${c.end} 100%)`;
    return acc;
}, {} as Record<string, string>);

const globalImageCache = new Map<string, string>();

const ImageThumbnail = ({ file }: { file: VaultFile }) => {
    const [url, setUrl] = useState<string | null>(globalImageCache.get(file.id) || null);

    useEffect(() => {
        if (!file.type.startsWith("image/")) return;
        if (globalImageCache.has(file.id)) {
            setUrl(globalImageCache.get(file.id)!);
            return;
        }
        let isMounted = true;
        downloadVaultFile(file).then(blob => {
            if (isMounted) {
                const objectUrl = URL.createObjectURL(blob);
                globalImageCache.set(file.id, objectUrl);
                setUrl(objectUrl);
            }
        }).catch(err => {
            console.error("Failed to load thumbnail", err);
        });
        return () => {
            isMounted = false;
        };
    }, [file]);

    if (!url) {
        return <FiImage size={18} style={{ color: "#4caf50" }} />;
    }

    return (
        <img src={url} alt={file.name} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
    );
};

export default function FileExplorer() {
    const { storageUsed, storageLimit, isStorageAtLimit, isPro } = useSubscription();
    
    const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
    const [breadcrumbs, setBreadcrumbs] = useState<{id: string | null, name: string}[]>([{ id: null, name: "Home" }]);
    
    const [folders, setFolders] = useState<VaultFolder[]>([]);
    const [files, setFiles] = useState<VaultFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Modals
    const [newFolderModalOpen, setNewFolderModalOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState("");
    
    const [renameModalOpen, setRenameModalOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<{id: string, name: string, isFolder: boolean} | null>(null);
    const [newName, setNewName] = useState("");

    const [deleteTarget, setDeleteTarget] = useState<{id: string, name: string, isFolder: boolean, file?: VaultFile} | null>(null);
    const [moveTarget, setMoveTarget] = useState<{id: string, name: string, isFolder: boolean} | null>(null);

    // View Mode
    const [viewMode, setViewMode] = useState<"grid" | "list">(() => {
        return (localStorage.getItem("fs_view_mode") as "grid" | "list") || "grid";
    });

    useEffect(() => {
        localStorage.setItem("fs_view_mode", viewMode);
    }, [viewMode]);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        target: { id: string, name: string, isFolder: boolean, file?: VaultFile };
    } | null>(null);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Uploading state
    const [uploadProgress, setUploadProgress] = useState<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [duplicatePrompt, setDuplicatePrompt] = useState<{
        fileName: string;
        resolve: (choice: 'replace' | 'keep' | 'skip') => void;
    } | null>(null);

    const askDuplicateAction = (fileName: string): Promise<'replace' | 'keep' | 'skip'> => {
        return new Promise((resolve) => {
            setDuplicatePrompt({ fileName, resolve });
        });
    };

    // Image Viewer
    const [selectedImage, setSelectedImage] = useState<{ file: VaultFile, url: string, pdfData?: Uint8Array } | null>(null);
    const [imageCache, setImageCache] = useState<Record<string, string>>({});
    const [imageMenuOpen, setImageMenuOpen] = useState(false);
    const [loadingFileId, setLoadingFileId] = useState<string | null>(null);
    const [loadingColor, setLoadingColor] = useState<string | null>(null);
    const [folderCounts, setFolderCounts] = useState<Record<string, number>>({});
    const [colorPickerTarget, setColorPickerTarget] = useState<{ id: string, name: string } | null>(null);

    // Zoom and Pan State
    const [zoomLevel, setZoomLevel] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const lastPanPos = useRef({ x: 0, y: 0 });
    const lastDragTime = useRef(0);
    const imageRef = useRef<HTMLImageElement>(null);

    // Block navigation during upload
    useBlocker(uploadProgress !== null);

    useEffect(() => {
        const handleResize = () => {
            if (selectedImage) {
                setPan({ x: 0, y: 0 });
            }
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
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
        setLoading(true);

        const unsubFolders = subscribeToFolders(currentFolderId, async (fetchedFolders) => {
            setFolders(fetchedFolders);
            
            const counts: Record<string, number> = {};
            await Promise.all(fetchedFolders.map(async f => {
                counts[f.id] = await getFolderItemCount(f.id);
            }));
            setFolderCounts(counts);
        });

        const unsubFiles = subscribeToFiles(currentFolderId, (fetchedFiles) => {
            setFiles(fetchedFiles);
            setLoading(false);
        });

        return () => {
            unsubFolders();
            unsubFiles();
        };
    }, [currentFolderId]);

    const navigateToFolder = (folderId: string | null, folderName: string) => {
        setCurrentFolderId(folderId);
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

    const handleRename = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!renameTarget || !newName.trim()) return;
        setActionLoading(true);
        try {
            if (renameTarget.isFolder) {
                await renameFolder(renameTarget.id, newName.trim());
            } else {
                await renameVaultFile(renameTarget.id, newName.trim());
            }
            setRenameModalOpen(false);
            setRenameTarget(null);
            setNewName("");

            setSelectedImage(prev => prev && prev.file.id === renameTarget.id 
                ? { ...prev, file: { ...prev.file, name: newName.trim() } } 
                : prev);
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setActionLoading(true);
        try {
            if (deleteTarget.isFolder) {
                await deleteFolder(deleteTarget.id);
            } else if (deleteTarget.file) {
                await deleteVaultFile(deleteTarget.file);
            }
            setDeleteTarget(null);

            setSelectedImage(prev => prev && prev.file.id === deleteTarget.id ? null : prev);
        } catch (err) {
            console.error(err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleMove = async (destinationFolderId: string | null) => {
        if (!moveTarget) return;
        setActionLoading(true);
        try {
            if (moveTarget.isFolder) {
                await moveFolder(moveTarget.id, destinationFolderId);
            } else {
                await moveVaultFile(moveTarget.id, destinationFolderId);
            }
            setMoveTarget(null);

            setSelectedImage(prev => prev && prev.file.id === moveTarget.id ? null : prev);
        } catch (err) {
            console.error(err);
            alert("Failed to move item.");
        } finally {
            setActionLoading(false);
        }
    };

    const handleColorChange = async (color: string) => {
        if (!colorPickerTarget) return;
        setLoadingColor(color || "reset");
        try {
            await updateFolderColor(colorPickerTarget.id, color);
            setColorPickerTarget(null);

        } catch (err) {
            console.error(err);
            alert("Failed to update color.");
        } finally {
            setLoadingColor(null);
        }
    };

    const openContextMenu = (clientX: number, clientY: number, target: { id: string, name: string, isFolder: boolean, file?: VaultFile }) => {
        let x = clientX;
        let y = clientY;

        // Context menu is ~160px wide and ~200px tall
        if (x + 170 > window.innerWidth) x = window.innerWidth - 180;
        if (y + 210 > window.innerHeight) y = window.innerHeight - 220;

        setContextMenu({ x, y, target });
    };

    const handleContextMenu = (e: React.MouseEvent, target: { id: string, name: string, isFolder: boolean, file?: VaultFile }) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, target);
    };

    const handleTouchStart = (e: React.TouchEvent, target: { id: string, name: string, isFolder: boolean, file?: VaultFile }) => {
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

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const uploadFiles = Array.from(e.target.files || []);
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

        try {
            let currentStorageUsed = storageUsed;
            let uploadedBytes = 0;
            setUploadProgress(0);
            
            for (let i = 0; i < uploadFiles.length; i++) {
                const file = uploadFiles[i];
                
                const fileToUpload = await compressImage(file);
                let finalFile = fileToUpload;
                const existingFile = files.find(f => f.name === finalFile.name);
                if (existingFile) {
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
                    alert(`Not enough storage space to upload "${finalFile.name}". Stopping upload.`);
                    break;
                }
                
                await uploadVaultFile(finalFile, currentFolderId, (progress) => {
                    const currentFileBytes = (progress / 100) * fileToUpload.size;
                    const overallProgress = ((uploadedBytes + currentFileBytes) / totalSize) * 100;
                    setUploadProgress(Math.min(overallProgress, 99.9));
                });
                
                uploadedBytes += fileToUpload.size;
                currentStorageUsed += fileToUpload.size;
            }
            
            setUploadProgress(100);

            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (err) {
            console.error("Upload failed", err);
            alert("Failed to upload file(s).");
        } finally {
            setUploadProgress(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleFileViewClick = async (file: VaultFile) => {
        const isImage = file.type.startsWith("image/");
        if (isImage) {
            setZoomLevel(1);
            setPan({ x: 0, y: 0 });
        }
        setZoomLevel(1);
        setPan({ x: 0, y: 0 });
        if (imageCache[file.id]) {
            setSelectedImage({ file, url: imageCache[file.id] });
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
                            file.type.startsWith("text/");
                            
        if (previewable) {
            handleFileViewClick(file);
        } else {
            handleDownload(file);
        }
    };

    const handleDownload = async (file: VaultFile) => {
        setActionLoading(true);
        setLoadingFileId(file.id);
        try {
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

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    const getFileIcon = (type: string) => {
        if (type.includes("image")) return <FiImage size={18} style={{ color: "#4caf50" }} />;
        if (type.includes("video")) return <FiVideo size={18} style={{ color: "#f44336" }} />;
        if (type.includes("audio")) return <FiMusic size={18} style={{ color: "#9c27b0" }} />;
        if (type.includes("pdf") || type.includes("text") || type.includes("document")) return <FiFileText size={18} style={{ color: "#2196f3" }} />;
        if (type.includes("zip") || type.includes("tar") || type.includes("rar")) return <FiArchive size={18} style={{ color: "#ff9800" }} />;
        return <FiFile size={18} style={{ color: "var(--text-secondary)" }} />;
    };

    return (
        <div className="file-explorer">
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
            <div className="content-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                    <button className="auth-submit" style={{ width: "auto", margin: 0, display: "flex", alignItems: "center", gap: "8px" }} onClick={() => setNewFolderModalOpen(true)}>
                        <FiPlus /> New Folder
                    </button>
                    <button className="auth-submit" style={{ width: "auto", margin: 0, display: "flex", alignItems: "center", gap: "8px", background: "var(--accent)" }} onClick={handleUploadClick} disabled={uploadProgress !== null || isStorageAtLimit}>
                        {uploadProgress !== null ? (
                            <><FiLoader size={16} className="spin" /> Uploading {Math.round(uploadProgress)}%</>
                        ) : (
                            <><FiUpload /> Upload File</>
                        )}
                    </button>
                    <input type="file" ref={fileInputRef} style={{ display: "none" }} onChange={handleFileChange} multiple />
                </div>
                
                <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
                    <div style={{ display: "flex", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)" }}>
                        <button 
                            type="button" 
                            onClick={() => setViewMode("grid")}
                            style={{ padding: "8px", background: viewMode === "grid" ? "var(--bg-secondary)" : "transparent", border: "none", color: "var(--text-primary)", cursor: "pointer", borderTopLeftRadius: "var(--radius-sm)", borderBottomLeftRadius: "var(--radius-sm)" }}
                            title="Grid View"
                        >
                            <FiGrid />
                        </button>
                        <button 
                            type="button" 
                            onClick={() => setViewMode("list")}
                            style={{ padding: "8px", background: viewMode === "list" ? "var(--bg-secondary)" : "transparent", border: "none", color: "var(--text-primary)", cursor: "pointer", borderTopRightRadius: "var(--radius-sm)", borderBottomRightRadius: "var(--radius-sm)", borderLeft: "1px solid var(--border-color)" }}
                            title="List View"
                        >
                            <FiList />
                        </button>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", fontSize: "0.85rem" }}>
                        <span style={{ color: "var(--text-secondary)", marginBottom: "4px" }}>
                            {formatSize(storageUsed)} / {formatSize(storageLimit)} Used
                        </span>
                        <div style={{ width: "100%", height: "8px", background: "var(--bg-secondary)", borderRadius: "4px", overflow: "hidden" }}>
                            <div style={{ width: `${storageUsed > 0 ? Math.max(2, (storageUsed / storageLimit) * 100) : 0}%`, height: "100%", background: isStorageAtLimit ? "var(--danger)" : "var(--accent)", transition: "width 0.3s ease" }} />
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

            {loading ? (
                <div style={{ textAlign: "center", padding: "40px" }}>
                    <div className="spin" style={{ display: "inline-block", border: "3px solid var(--border-color)", borderTopColor: "var(--accent)", borderRadius: "50%", width: "24px", height: "24px" }} />
                </div>
            ) : folders.length === 0 && files.length === 0 ? (
                <div className="empty-state">
                    <FiFolder size={48} style={{ color: "var(--text-muted)", marginBottom: "16px" }} />
                    <p>This folder is empty.</p>
                </div>
            ) : (
                <div className={`file-grid ${viewMode === "list" ? "list-view" : ""}`}>
                    {folders.map(folder => (
                        <div 
                            key={folder.id} 
                            className="file-card" 
                            onClick={() => navigateToFolder(folder.id, folder.name)}
                            onContextMenu={(e) => handleContextMenu(e, { id: folder.id, name: folder.name, isFolder: true })}
                            onTouchStart={(e) => handleTouchStart(e, { id: folder.id, name: folder.name, isFolder: true })}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchMove}
                        >
                            <div className="file-card-icon">
                                <FiFolder 
                                    size={18} 
                                    style={{ color: folder.color ? "transparent" : "var(--text-primary)" }}
                                    fill={folder.color ? `url(#gradient-${folder.color})` : "none"}
                                />
                            </div>
                            <div className="file-card-info">
                                <span className="file-name" style={{ fontWeight: 'normal' }}>{folder.name}</span>
                                <span className="file-size">
                                    {folderCounts[folder.id] !== undefined 
                                        ? `${folderCounts[folder.id]} item${folderCounts[folder.id] !== 1 ? 's' : ''}` 
                                        : "Loading..."}
                                </span>
                            </div>
                            <div className="file-actions" onClick={(e) => { e.stopPropagation(); handleContextMenu(e, { id: folder.id, name: folder.name, isFolder: true }); }}>
                                <button title="Options">
                                    <FiMoreHorizontal size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {files.map(file => (
                        <div 
                            key={file.id} 
                            className="file-card"
                            onClick={() => handleFileClick(file)}
                            onContextMenu={(e) => handleContextMenu(e, { id: file.id, name: file.name, isFolder: false, file })}
                            onTouchStart={(e) => handleTouchStart(e, { id: file.id, name: file.name, isFolder: false, file })}
                            onTouchEnd={handleTouchEnd}
                            onTouchMove={handleTouchMove}
                        >
                            <div className="file-card-icon">
                                {loadingFileId === file.id ? (
                                    <FiLoader size={16} className="spin" style={{ color: "var(--accent)" }} />
                                ) : (
                                    file.type.startsWith("image/") ? <ImageThumbnail file={file} /> : getFileIcon(file.type)
                                )}
                            </div>
                            <div className="file-card-info">
                                <span className="file-name" style={{ fontWeight: 'normal' }}>{file.name}</span>
                                <span className="file-size">{formatSize(file.size)}</span>
                            </div>
                            <div className="file-actions" onClick={(e) => { e.stopPropagation(); handleContextMenu(e, { id: file.id, name: file.name, isFolder: false, file }); }}>
                                <button title="Options">
                                    <FiMoreHorizontal size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {contextMenu && (
                <div 
                    className="context-menu" 
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {!contextMenu.target.isFolder && (
                        <button className="context-menu-item" onClick={() => { handleDownload(contextMenu.target.file!); setContextMenu(null); }}>
                            {loadingFileId === contextMenu.target.id ? <FiLoader className="spin" /> : <FiDownload />} Download
                        </button>
                    )}
                    <button className="context-menu-item" onClick={() => { setRenameTarget(contextMenu.target); setNewName(contextMenu.target.name); setRenameModalOpen(true); setContextMenu(null); }}>
                        <FiEdit2 /> Rename
                    </button>
                    <button className="context-menu-item" onClick={() => { setMoveTarget(contextMenu.target); setContextMenu(null); }}>
                        <FiCornerUpRight /> Move
                    </button>
                    {contextMenu.target.isFolder && (
                        <button className="context-menu-item" onClick={() => { setColorPickerTarget({ id: contextMenu.target.id, name: contextMenu.target.name }); setContextMenu(null); }}>
                            <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'linear-gradient(135deg, #ffd1dc, #ffdfba, #bae1ff)' }} /> Color
                        </button>
                    )}
                    <button className="context-menu-item danger" onClick={() => { setDeleteTarget(contextMenu.target); setContextMenu(null); }}>
                        <FiTrash2 /> Delete
                    </button>
                </div>
            )}

            <FolderPickerModal
                isOpen={moveTarget !== null}
                onClose={() => setMoveTarget(null)}
                onSelect={(folderId) => handleMove(folderId)}
                currentFolderId={currentFolderId}
                movingItemId={moveTarget?.id || ""}
                isMovingFolder={moveTarget?.isFolder || false}
                actionLoading={actionLoading}
            />

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
                        <h3>File Already Exists</h3>
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
                            {selectedImage.file.type.startsWith('image/') && (
                                <>
                                    <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.5, 5))} title="Zoom In"><FiZoomIn /></button>
                                    <button onClick={() => { setZoomLevel(prev => Math.max(prev - 0.5, 0.5)); setPan({x:0, y:0}); }} title="Zoom Out"><FiZoomOut /></button>
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
                            <button onClick={() => { setRenameTarget({id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false}); setNewName(selectedImage.file.name); setRenameModalOpen(true); }}><FiEdit2 /> Rename</button>
                            <button onClick={() => { setMoveTarget({id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false}); }}><FiCornerUpRight /> Move</button>
                            <button className="danger" onClick={() => { setDeleteTarget({ id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false, file: selectedImage.file }); }}><FiTrash2 /> Delete</button>
                            <button className="close-btn" onClick={() => { setSelectedImage(null); setZoomLevel(1); setPan({x:0, y:0}); }}><FiX size={24} /></button>
                        </div>
                        
                        <div className="image-viewer-actions mobile-only">
                            {selectedImage.file.type.startsWith('image/') && (
                                <>
                                    <button onClick={() => setZoomLevel(prev => Math.min(prev + 0.5, 5))} title="Zoom In" style={{ padding: "8px" }}><FiZoomIn size={20} /></button>
                                    <button onClick={() => { setZoomLevel(prev => Math.max(prev - 0.5, 0.5)); setPan({x:0, y:0}); }} title="Zoom Out" style={{ padding: "8px" }}><FiZoomOut size={20} /></button>
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
                                    <button onClick={() => { setRenameTarget({id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false}); setNewName(selectedImage.file.name); setRenameModalOpen(true); setImageMenuOpen(false); }}><FiEdit2 /> Rename</button>
                                    <button onClick={() => { setMoveTarget({id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false}); setImageMenuOpen(false); }}><FiCornerUpRight /> Move</button>
                                    <button className="danger" onClick={() => { setDeleteTarget({ id: selectedImage.file.id, name: selectedImage.file.name, isFolder: false, file: selectedImage.file }); setImageMenuOpen(false); }}><FiTrash2 /> Delete</button>
                                </div>
                            )}
                        </div>
                    </div>
                    <div 
                        className="image-viewer-content" 
                        style={{ padding: selectedImage.file.type === 'application/pdf' ? 0 : undefined }}
                        onWheel={(e) => {
                            if (e.deltaY < 0) {
                                setZoomLevel(prev => Math.min(prev + 0.25, 5));
                            } else {
                                setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
                                setPan({x: 0, y: 0});
                            }
                        }}
                    >
                        {selectedImage.file.type.startsWith('image/') ? (
                            <img 
                            ref={imageRef}
                            src={selectedImage.url} 
                            alt={selectedImage.file.name} 
                            onClick={(e) => { 
                                e.stopPropagation(); 
                                if (imageMenuOpen) setImageMenuOpen(false); 
                            }} 
                            onPointerDown={(e) => {
                                if (zoomLevel <= 1) return;
                                setIsDragging(true);
                                lastPanPos.current = { x: e.clientX, y: e.clientY };
                                e.currentTarget.setPointerCapture(e.pointerId);
                            }}
                            onPointerMove={(e) => {
                                if (!isDragging) return;
                                const dx = e.clientX - lastPanPos.current.x;
                                const dy = e.clientY - lastPanPos.current.y;
                                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) lastDragTime.current = Date.now();
                                
                                setPan(prev => {
                                    let newX = prev.x + dx;
                                    let newY = prev.y + dy;
                                    
                                    if (imageRef.current) {
                                        const w = imageRef.current.clientWidth * zoomLevel;
                                        const h = imageRef.current.clientHeight * zoomLevel;
                                        const boundaryMult = window.innerWidth <= 768 ? 0.4 : 0.2;
                                        const maxDragX = w * boundaryMult + window.innerWidth / 2;
                                        const maxDragY = h * boundaryMult + window.innerHeight / 2;
                                        
                                        if (newX > maxDragX) newX = maxDragX;
                                        if (newX < -maxDragX) newX = -maxDragX;
                                        if (newY > maxDragY) newY = maxDragY;
                                        if (newY < -maxDragY) newY = -maxDragY;
                                    }
                                    return { x: newX, y: newY };
                                });
                                lastPanPos.current = { x: e.clientX, y: e.clientY };
                            }}
                            onPointerUp={(e) => {
                                setIsDragging(false);
                                e.currentTarget.releasePointerCapture(e.pointerId);
                                
                                setPan(prev => {
                                    if (!imageRef.current) return prev;
                                    const w = imageRef.current.clientWidth * zoomLevel;
                                    const h = imageRef.current.clientHeight * zoomLevel;
                                    const boundaryMult = window.innerWidth <= 768 ? 0.4 : 0.2;
                                    const maxDragX = w * boundaryMult + window.innerWidth / 2;
                                    const maxDragY = h * boundaryMult + window.innerHeight / 2;
                                    
                                    if (Math.abs(prev.x) >= maxDragX - 5 || Math.abs(prev.y) >= maxDragY - 5) {
                                        return { x: 0, y: 0 };
                                    }
                                    return prev;
                                });
                            }}
                            onPointerCancel={(e) => {
                                setIsDragging(false);
                                e.currentTarget.releasePointerCapture(e.pointerId);
                            }}
                            style={{ 
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomLevel})`,
                                transition: isDragging ? 'none' : 'transform 0.1s ease-out',
                                cursor: zoomLevel > 1 ? (isDragging ? "grabbing" : "grab") : "default"
                            }}
                            draggable={false}
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
                        ) : (
                            <div style={{ width: '100%', height: '100%', overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                <iframe 
                                    src={selectedImage.url} 
                                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 'var(--radius-md)', background: '#fff' }}
                                    title={selectedImage.file.name}
                                />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
