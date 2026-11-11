import { createFolder, uploadVaultFile } from "../services/fileService";
import { downloadSharedFile } from "../services/shareService";
import type { SharedItem, SharedFileEntry } from "../services/shareService";

export interface SharedFolderLocation {
    shareId: string;
    subPath: string;
}

export interface SharedVirtualFolder {
    name: string;
    subPath: string;
    entries: SharedFileEntry[];
    totalSize: number;
}

export interface SharedVirtualFile {
    entry: SharedFileEntry;
    displayName: string;
}

export function parseSharedFolderLocation(folderId: string | null): SharedFolderLocation | null {
    if (!folderId || !folderId.startsWith("__shared__:")) return null;
    const rest = folderId.slice("__shared__:".length);
    const sepIdx = rest.indexOf("::");
    if (sepIdx === -1) return { shareId: rest, subPath: "" };
    return {
        shareId: rest.slice(0, sepIdx),
        subPath: rest.slice(sepIdx + 2),
    };
}

export function buildSharedFolderId(shareId: string, subPath?: string): string {
    if (!subPath) return `__shared__:${shareId}`;
    return `__shared__:${shareId}::${subPath}`;
}

export function getSharedDirectoryEntries(
    filesList: SharedFileEntry[],
    subPath: string
): { folders: SharedVirtualFolder[]; files: SharedVirtualFile[] } {
    const normalizedSub = subPath.replace(/^\/+|\/+$/g, "");
    const prefix = normalizedSub ? `${normalizedSub}/` : "";
    const folderMap = new Map<string, SharedVirtualFolder>();
    const directFiles: SharedVirtualFile[] = [];

    for (const entry of filesList) {
        const cleanPath = (entry.path || entry.name).replace(/^\/+/, "");
        if (prefix && !cleanPath.startsWith(prefix)) continue;

        const remainder = prefix ? cleanPath.slice(prefix.length) : cleanPath;
        if (!remainder) continue;

        const slashIdx = remainder.indexOf("/");
        if (slashIdx === -1) {
            directFiles.push({ entry, displayName: remainder });
        } else {
            const folderName = remainder.slice(0, slashIdx);
            const nextSubPath = normalizedSub ? `${normalizedSub}/${folderName}` : folderName;
            const existing = folderMap.get(folderName);
            if (existing) {
                existing.entries.push(entry);
                existing.totalSize += entry.size || 0;
            } else {
                folderMap.set(folderName, {
                    name: folderName,
                    subPath: nextSubPath,
                    entries: [entry],
                    totalSize: entry.size || 0,
                });
            }
        }
    }

    const folders = Array.from(folderMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );

    return { folders, files: directFiles };
}

export async function copySharedEntriesToVault(
    share: SharedItem,
    entries: SharedFileEntry[],
    destinationFolderId: string | null,
    basePrefixToStrip = ""
): Promise<void> {
    const dirCache = new Map<string, string | null>([["", destinationFolderId]]);
    const normStrip = basePrefixToStrip.replace(/^\/+|\/+$/g, "");

    const ensureFolderPath = async (relDirPath: string): Promise<string | null> => {
        if (dirCache.has(relDirPath)) return dirCache.get(relDirPath) ?? destinationFolderId;
        const segments = relDirPath.split("/").filter(Boolean);
        let currentKey = "";
        let parentId = destinationFolderId;

        for (const seg of segments) {
            currentKey = currentKey ? `${currentKey}/${seg}` : seg;
            if (dirCache.has(currentKey)) {
                parentId = dirCache.get(currentKey) ?? parentId;
            } else {
                const createdId = await createFolder(seg, parentId);
                dirCache.set(currentKey, createdId);
                parentId = createdId;
            }
        }
        return parentId;
    };

    for (const entry of entries) {
        let relPath = (entry.path || entry.name).replace(/^\/+/, "");
        if (normStrip && relPath.startsWith(`${normStrip}/`)) {
            relPath = relPath.slice(normStrip.length + 1);
        }
        const lastSlash = relPath.lastIndexOf("/");
        const dirPart = lastSlash > 0 ? relPath.slice(0, lastSlash) : "";
        const targetFolderId = dirPart ? await ensureFolderPath(dirPart) : destinationFolderId;

        const blob = await downloadSharedFile(share, entry);
        const fileObj = new File([blob], entry.name, {
            type: entry.type || blob.type || "application/octet-stream",
        });
        await uploadVaultFile(fileObj, targetFolderId);
    }
}

export function formatMediaDuration(seconds?: number): string {
    if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return "";
    const whole = Math.floor(seconds);
    const hrs = Math.floor(whole / 3600);
    const mins = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    if (hrs > 0) {
        return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }
    return `${mins}:${String(secs).padStart(2, "0")}`;
}

