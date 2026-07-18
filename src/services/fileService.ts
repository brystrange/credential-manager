import {
    collection,
    addDoc,
    updateDoc,
    doc,
    getDocs,
    deleteDoc,
    query,
    where,
    Timestamp,
    increment,
    getCountFromServer
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, auth, storage } from "../firebaseConfig";
import { getEncryptionKey } from "./authService";
import { encryptPassword, decryptPassword, encryptFile, decryptFile } from "./crypto";

export interface VaultFolder {
    id: string;
    name: string;
    parentId: string | null;
    color?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface VaultFile {
    id: string;
    name: string;
    type: string;
    size: number;
    folderId: string | null;
    storagePath: string;
    createdAt: Date;
    updatedAt: Date;
}

function getUserFoldersRef() {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    return collection(db, "users", uid, "folders");
}

function getUserFilesRef() {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    return collection(db, "users", uid, "files");
}

const foldersCache = new Map<string, { data: VaultFolder[], timestamp: number }>();
const filesCache = new Map<string, { data: VaultFile[], timestamp: number }>();
const countsCache = new Map<string, { data: number, timestamp: number }>();
let allFoldersCache: { data: VaultFolder[], timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function updateCachedFolder(id: string, updates: Partial<VaultFolder>) {
    for (const cached of foldersCache.values()) {
        const idx = cached.data.findIndex(f => f.id === id);
        if (idx !== -1) {
            cached.data[idx] = { ...cached.data[idx], ...updates, updatedAt: new Date() };
            if (updates.name) cached.data.sort((a, b) => a.name.localeCompare(b.name));
        }
    }
    if (allFoldersCache) {
        const idx = allFoldersCache.data.findIndex(f => f.id === id);
        if (idx !== -1) {
            allFoldersCache.data[idx] = { ...allFoldersCache.data[idx], ...updates, updatedAt: new Date() };
        }
    }
}

function updateCachedFile(id: string, updates: Partial<VaultFile>) {
    for (const cached of filesCache.values()) {
        const idx = cached.data.findIndex(f => f.id === id);
        if (idx !== -1) {
            cached.data[idx] = { ...cached.data[idx], ...updates, updatedAt: new Date() };
            if (updates.name) cached.data.sort((a, b) => a.name.localeCompare(b.name));
        }
    }
}

function invalidateFolderRelations(id: string) {
    let parentId: string | null | undefined = undefined;
    for (const cached of foldersCache.values()) {
        const found = cached.data.find(f => f.id === id);
        if (found) {
            parentId = found.parentId;
            break;
        }
    }
    if (parentId !== undefined) {
        foldersCache.delete(String(parentId));
        countsCache.delete(String(parentId));
    }
    foldersCache.delete(String(id));
    filesCache.delete(String(id));
    countsCache.delete(String(id));
    allFoldersCache = null;
}

function invalidateFileRelations(id: string) {
    let folderId: string | null | undefined = undefined;
    for (const cached of filesCache.values()) {
        const found = cached.data.find(f => f.id === id);
        if (found) {
            folderId = found.folderId;
            break;
        }
    }
    if (folderId !== undefined) {
        filesCache.delete(String(folderId));
        countsCache.delete(String(folderId));
    }
}

// ─── Folders ─────────────────────────────────────────────────────────────

export async function getFolders(parentId: string | null = null): Promise<VaultFolder[]> {
    const cacheKey = String(parentId);
    const cached = foldersCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    const key = getEncryptionKey();
    const q = query(getUserFoldersRef(), where("parentId", "==", parentId));
    const snapshot = await getDocs(q);

    const folders: VaultFolder[] = [];
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let decryptedName = "";
        try {
            decryptedName = await decryptPassword(data.name, key);
        } catch (e) {
            decryptedName = "[Encrypted]";
        }
        folders.push({
            id: docSnap.id,
            name: decryptedName,
            parentId: data.parentId,
            color: data.color || undefined,
            createdAt: (data.createdAt as Timestamp).toDate(),
            updatedAt: (data.updatedAt as Timestamp).toDate(),
        });
    }
    const result = folders.sort((a, b) => a.name.localeCompare(b.name));
    foldersCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
}

export async function getFolderItemCount(folderId: string): Promise<number> {
    const cacheKey = String(folderId);
    const cached = countsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    const folderCountQuery = query(getUserFoldersRef(), where("parentId", "==", folderId));
    const fileCountQuery = query(getUserFilesRef(), where("folderId", "==", folderId));
    
    const [folderSnap, fileSnap] = await Promise.all([
        getCountFromServer(folderCountQuery),
        getCountFromServer(fileCountQuery)
    ]);
    const count = folderSnap.data().count + fileSnap.data().count;
    countsCache.set(cacheKey, { data: count, timestamp: Date.now() });
    return count;
}

export async function getAllFolders(): Promise<VaultFolder[]> {
    if (allFoldersCache && Date.now() - allFoldersCache.timestamp < CACHE_TTL_MS) {
        return allFoldersCache.data;
    }

    const key = getEncryptionKey();
    const snapshot = await getDocs(getUserFoldersRef());

    const folders: VaultFolder[] = [];
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let decryptedName = "";
        try {
            decryptedName = await decryptPassword(data.name, key);
        } catch (e) {
            decryptedName = "[Encrypted]";
        }
        folders.push({
            id: docSnap.id,
            name: decryptedName,
            parentId: data.parentId,
            color: data.color || undefined,
            createdAt: (data.createdAt as Timestamp).toDate(),
            updatedAt: (data.updatedAt as Timestamp).toDate(),
        });
    }
    
    allFoldersCache = { data: folders, timestamp: Date.now() };
    return folders;
}

export async function createFolder(name: string, parentId: string | null = null): Promise<string> {
    const key = getEncryptionKey();
    const encryptedName = await encryptPassword(name, key);
    const now = Timestamp.now();

    const docRef = await addDoc(getUserFoldersRef(), {
        name: encryptedName,
        parentId,
        createdAt: now,
        updatedAt: now,
    });
    foldersCache.delete(String(parentId));
    countsCache.delete(String(parentId));
    allFoldersCache = null;
    return docRef.id;
}

export async function renameFolder(id: string, newName: string): Promise<void> {
    const key = getEncryptionKey();
    const encryptedName = await encryptPassword(newName, key);
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const docRef = doc(db, "users", uid, "folders", id);
    await updateDoc(docRef, {
        name: encryptedName,
        updatedAt: Timestamp.now(),
    });
    updateCachedFolder(id, { name: newName });
}

export async function updateFolderColor(id: string, color: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const docRef = doc(db, "users", uid, "folders", id);
    await updateDoc(docRef, {
        color: color,
        updatedAt: Timestamp.now(),
    });
    updateCachedFolder(id, { color });
}

export async function deleteFolder(id: string): Promise<void> {
    // Basic deletion (does not recursively delete children for simplicity, 
    // in a real app you'd want a Cloud Function or recursive batch delete)
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    const docRef = doc(db, "users", uid, "folders", id);
    await deleteDoc(docRef);
    invalidateFolderRelations(id);
}

// ─── Files ───────────────────────────────────────────────────────────────

export async function getFiles(folderId: string | null = null): Promise<VaultFile[]> {
    const cacheKey = String(folderId);
    const cached = filesCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
    }

    const key = getEncryptionKey();
    const q = query(getUserFilesRef(), where("folderId", "==", folderId));
    const snapshot = await getDocs(q);

    const files: VaultFile[] = [];
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let decryptedName = "";
        let decryptedType = "";
        try {
            decryptedName = await decryptPassword(data.name, key);
            decryptedType = await decryptPassword(data.type, key);
        } catch {
            decryptedName = "[decryption failed]";
            decryptedType = "application/octet-stream";
        }
        files.push({
            id: docSnap.id,
            name: decryptedName,
            type: decryptedType,
            size: data.size,
            folderId: data.folderId,
            storagePath: data.storagePath,
            createdAt: (data.createdAt as Timestamp).toDate(),
            updatedAt: (data.updatedAt as Timestamp).toDate(),
        });
    }
    const result = files.sort((a, b) => a.name.localeCompare(b.name));
    filesCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
}

export async function uploadVaultFile(
    file: File, 
    folderId: string | null = null, 
    onProgress?: (progress: number) => void
): Promise<string> {
    const key = getEncryptionKey();
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    // 1. Encrypt Metadata
    const encryptedName = await encryptPassword(file.name, key);
    const encryptedType = await encryptPassword(file.type || "application/octet-stream", key);

    // 2. Encrypt File Contents
    const fileBuffer = await file.arrayBuffer();
    const encryptedBlob = await encryptFile(fileBuffer, key);

    // 3. Upload to Firebase Storage
    // Use a unique ID for the storage path
    const fileId = crypto.randomUUID();
    const storagePath = `users/${uid}/files/${fileId}`;
    const storageRef = ref(storage, storagePath);

    return new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, encryptedBlob);

        uploadTask.on("state_changed", 
            (snapshot) => {
                if (onProgress) {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    onProgress(progress);
                }
            },
            (error) => {
                reject(error);
            },
            async () => {
                // 4. Save Metadata to Firestore
                try {
                    const now = Timestamp.now();
                    const docRef = await addDoc(getUserFilesRef(), {
                        name: encryptedName,
                        type: encryptedType,
                        size: file.size, // save original size for UI
                        folderId,
                        storagePath,
                        createdAt: now,
                        updatedAt: now,
                    });
                    
                    // Update user's storage usage
                    await updateDoc(doc(db, "users", uid), {
                        storageUsed: increment(file.size)
                    });
                    
                    filesCache.delete(String(folderId));
                    countsCache.delete(String(folderId));
                    resolve(docRef.id);
                } catch (err) {
                    reject(err);
                }
            }
        );
    });
}

export async function updateVaultFile(
    fileId: string,
    existingStoragePath: string,
    fileData: Uint8Array | ArrayBuffer,
    newSize: number,
    onProgress?: (progress: number) => void
): Promise<void> {
    const key = getEncryptionKey();
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    // 1. Encrypt File Contents
    const dataBuffer = fileData instanceof Uint8Array ? fileData.buffer : fileData;
    const encryptedBlob = await encryptFile(dataBuffer as ArrayBuffer, key);

    // 2. Upload to existing Firebase Storage path
    const storageRef = ref(storage, existingStoragePath);

    return new Promise((resolve, reject) => {
        const uploadTask = uploadBytesResumable(storageRef, encryptedBlob);

        uploadTask.on("state_changed", 
            (snapshot) => {
                if (onProgress) {
                    const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                    onProgress(progress);
                }
            },
            (error) => {
                reject(error);
            },
            async () => {
                // 3. Update Metadata in Firestore
                try {
                    const now = Timestamp.now();
                    
                    // Note: We don't have the original size here, so storageUsed might get slightly inaccurate if we just increment/decrement.
                    // A proper implementation would decrement the old size and increment the new size, but for now we'll just update the file document's size.
                    
                    await updateDoc(doc(db, `users/${uid}/files/${fileId}`), {
                        size: newSize,
                        updatedAt: now,
                    });
                    
                    updateCachedFile(fileId, { size: newSize });
                    resolve();
                } catch (error) {
                    reject(error);
                }
            }
        );
    });
}

export async function downloadVaultFile(vaultFile: VaultFile): Promise<Blob> {
    const key = getEncryptionKey();
    
    // 1. Get the download URL for the encrypted blob
    const storageRef = ref(storage, vaultFile.storagePath);
    const url = await getDownloadURL(storageRef);

    // 2. Fetch the blob
    const response = await fetch(url);
    const encryptedBlob = await response.blob();

    // 3. Decrypt the blob
    const decryptedBlob = await decryptFile(encryptedBlob, key, vaultFile.type);
    return decryptedBlob;
}

export async function renameVaultFile(id: string, newName: string): Promise<void> {
    const key = getEncryptionKey();
    const encryptedName = await encryptPassword(newName, key);
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const docRef = doc(db, "users", uid, "files", id);
    await updateDoc(docRef, {
        name: encryptedName,
        updatedAt: Timestamp.now(),
    });
    updateCachedFile(id, { name: newName });
}

export async function deleteVaultFile(vaultFile: VaultFile): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    // 1. Delete from Storage
    const storageRef = ref(storage, vaultFile.storagePath);
    await deleteObject(storageRef);

    // 2. Delete from Firestore
    const docRef = doc(db, "users", uid, "files", vaultFile.id);
    await deleteDoc(docRef);

    // 3. Update user's storage usage
    await updateDoc(doc(db, "users", uid), {
        storageUsed: increment(-vaultFile.size)
    });
    filesCache.delete(String(vaultFile.folderId));
    countsCache.delete(String(vaultFile.folderId));
}

export async function moveFolder(id: string, newParentId: string | null): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    
    // Prevent moving a folder into itself
    if (id === newParentId) throw new Error("Cannot move a folder into itself");

    const docRef = doc(db, "users", uid, "folders", id);
    await updateDoc(docRef, {
        parentId: newParentId,
        updatedAt: Timestamp.now(),
    });
    invalidateFolderRelations(id);
    foldersCache.delete(String(newParentId));
    countsCache.delete(String(newParentId));
}

export async function moveVaultFile(id: string, newFolderId: string | null): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const docRef = doc(db, "users", uid, "files", id);
    await updateDoc(docRef, {
        folderId: newFolderId,
        updatedAt: Timestamp.now(),
    });
    invalidateFileRelations(id);
    filesCache.delete(String(newFolderId));
    countsCache.delete(String(newFolderId));
}
