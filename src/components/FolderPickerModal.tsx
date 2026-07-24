import { useState, useEffect } from "react";
import { FiX, FiFolder, FiLoader } from "react-icons/fi";
import { getAllFolders } from "../services/fileService";
import type { VaultFolder } from "../services/fileService";

interface FolderPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (folderId: string | null) => void;
    currentFolderId: string | null;
    movingFolderIds?: string[]; // IDs of folders being moved
    actionLoading?: boolean;
}

export default function FolderPickerModal({ isOpen, onClose, onSelect, currentFolderId, movingFolderIds = [], actionLoading }: FolderPickerModalProps) {
    const [folders, setFolders] = useState<VaultFolder[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setSelectedId(currentFolderId);
            getAllFolders().then(f => {
                setFolders(f);
                setLoading(false);
            }).catch(e => {
                console.error(e);
                setLoading(false);
            });
        }
    }, [isOpen, currentFolderId]);

    if (!isOpen) return null;

    // Helper to check if a folder is a descendant of the moving folder
    const isDescendant = (folderId: string, ancestorId: string): boolean => {
        if (folderId === ancestorId) return true;
        const folder = folders.find(f => f.id === folderId);
        if (!folder || !folder.parentId) return false;
        return isDescendant(folder.parentId, ancestorId);
    };

    const buildPath = (folder: VaultFolder): string => {
        if (!folder.parentId) return folder.name;
        const parent = folders.find(f => f.id === folder.parentId);
        if (!parent) return folder.name;
        return `${buildPath(parent)} / ${folder.name}`;
    };

    // Filter out the folders being moved (and their descendants)
    const validFolders = folders.filter(f => {
        if (movingFolderIds.some(mId => isDescendant(f.id, mId))) return false;
        return true;
    });

    // Sort by path for nicer display, and calculate depth
    const foldersToDisplay = validFolders.map(f => {
        const path = buildPath(f);
        const depth = path.split(' / ').length - 1;
        return { ...f, path, depth };
    }).sort((a, b) => a.path.localeCompare(b.path));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSelect(selectedId);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Move to...</h2>
                    <button className="modal-close" onClick={onClose}><FiX size={20} /></button>
                </div>
                <form onSubmit={handleSubmit} className="modal-body">
                    {loading ? (
                        <p style={{ textAlign: "center", margin: "20px 0", color: "var(--text-secondary)" }}>Loading folders...</p>
                    ) : (
                        <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid var(--border)", borderRadius: "8px", padding: "8px", display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.8rem" }}>
                            
                            <div 
                                onClick={() => setSelectedId(null)}
                                style={{ 
                                    padding: "8px", 
                                    borderRadius: "4px", 
                                    cursor: "pointer", 
                                    display: "flex", 
                                    alignItems: "center", 
                                    gap: "8px",
                                    background: selectedId === null ? "var(--bg-secondary)" : "transparent",
                                    border: selectedId === null ? "1px solid var(--accent)" : "1px solid transparent"
                                }}
                            >
                                <FiFolder size={16} style={{ color: "var(--text-secondary)" }} />
                                <span>Home (Root)</span>
                            </div>

                            {foldersToDisplay.map(f => (
                                <div 
                                    key={f.id}
                                    onClick={() => setSelectedId(f.id)}
                                    style={{ 
                                        padding: `8px 8px 8px ${8 + f.depth * 24}px`, 
                                        borderRadius: "4px", 
                                        cursor: "pointer", 
                                        display: "flex", 
                                        alignItems: "center", 
                                        gap: "8px",
                                        background: selectedId === f.id ? "var(--bg-secondary)" : "transparent",
                                        border: selectedId === f.id ? "1px solid var(--accent)" : "1px solid transparent"
                                    }}
                                >
                                    <FiFolder size={16} style={{ color: "var(--text-secondary)" }} />
                                    <span style={{ wordBreak: "break-all" }}>{f.name}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    <div className="modal-actions" style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end", gap: "12px", alignItems: "center" }}>
                        <button type="button" className="btn-secondary" onClick={onClose} disabled={actionLoading}>Cancel</button>
                        <button type="submit" className="btn-primary" disabled={loading || actionLoading || selectedId === currentFolderId} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {actionLoading ? <><FiLoader size={16} className="spin" /> Moving...</> : "Move Here"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
