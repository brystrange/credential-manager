import {
    collection,
    setDoc,
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

import { onSnapshot } from "firebase/firestore";

function folderNameAad(uid: string, folderId: string): string {
    return `fs:v1:folder:${uid}:${folderId}:name`;
}

function fileFieldAad(uid: string, fileId: string, field: "name" | "type"): string {
    return `fs:v1:file:${uid}:${fileId}:${field}`;
}

// Helper function to try decrypting names
async function tryDecryptName(encryptedName: string, key: CryptoKey, expectedAad?: string): Promise<string> {
    try {
        return await decryptPassword(encryptedName, key, expectedAad);
    } catch {
        return "[Encrypted]";
    }
}

// ─── Folders ─────────────────────────────────────────────────────────────

export function subscribeToFolders(parentId: string | null = null, callback: (folders: VaultFolder[]) => void): () => void {
    const key = getEncryptionKey();
    const uid = auth.currentUser?.uid;
    if (!key || !uid) return () => {};

    let cancelled = false;
    let latestSeq = 0;
    const q = query(getUserFoldersRef(), where("parentId", "==", parentId));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const seq = ++latestSeq;
        const folders: VaultFolder[] = [];
        for (const docSnap of snapshot.docs) {
            if (cancelled || seq !== latestSeq) return;
            const data = docSnap.data();
            const decryptedName = await tryDecryptName(data.name, key, folderNameAad(uid, docSnap.id));
            folders.push({
                id: docSnap.id,
                name: decryptedName,
                parentId: data.parentId,
                color: data.color || undefined,
                createdAt: (data.createdAt as Timestamp).toDate(),
                updatedAt: (data.updatedAt as Timestamp).toDate(),
            });
        }
        if (!cancelled && seq === latestSeq) {
            callback(folders.sort((a, b) => a.name.localeCompare(b.name)));
        }
    }, (error) => {
        console.error("Folders subscription error:", error);
    });

    return () => {
        cancelled = true;
        unsubscribe();
    };
}

const folderCountCache = new Map<string, number>();
const folderCountInFlight = new Map<string, Promise<number>>();
let folderCountGeneration = 0;

export function clearFileServiceCache(): void {
    folderCountGeneration++;
    folderCountCache.clear();
    folderCountInFlight.clear();
}

function invalidateFolderCountCache(): void {
    clearFileServiceCache();
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vault-folders-updated"));
    }
}

function notifyVaultFilesUpdated(): void {
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("vault-files-updated"));
    }
}

export async function getFolderItemCount(folderId: string): Promise<number> {
    if (folderCountCache.has(folderId)) {
        return folderCountCache.get(folderId)!;
    }
    const existing = folderCountInFlight.get(folderId);
    if (existing) {
        return existing;
    }

    const startGeneration = folderCountGeneration;
    const promise = (async () => {
        const folderQuery = query(getUserFoldersRef(), where("parentId", "==", folderId));
        const fileCountQuery = query(getUserFilesRef(), where("folderId", "==", folderId));

        const [folderSnap, fileSnap] = await Promise.all([
            getDocs(folderQuery),
            getCountFromServer(fileCountQuery),
        ]);

        let count = fileSnap.data().count;

        const subfolderPromises = folderSnap.docs.map((d) => getFolderItemCount(d.id));
        const subfolderCounts = await Promise.all(subfolderPromises);

        for (const subCount of subfolderCounts) {
            count += subCount;
        }

        if (folderCountGeneration === startGeneration) {
            folderCountCache.set(folderId, count);
        }
        return count;
    })().finally(() => {
        folderCountInFlight.delete(folderId);
    });

    folderCountInFlight.set(folderId, promise);
    return promise;
}

export async function getAllFolders(): Promise<VaultFolder[]> {
    const key = getEncryptionKey();
    const uid = auth.currentUser?.uid;
    if (!key || !uid) return [];

    const snapshot = await getDocs(getUserFoldersRef());

    const folders: VaultFolder[] = [];
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const decryptedName = await tryDecryptName(data.name, key, folderNameAad(uid, docSnap.id));
        folders.push({
            id: docSnap.id,
            name: decryptedName,
            parentId: data.parentId,
            color: data.color || undefined,
            createdAt: (data.createdAt as Timestamp).toDate(),
            updatedAt: (data.updatedAt as Timestamp).toDate(),
        });
    }
    
    return folders;
}

export async function createFolder(name: string, parentId: string | null = null): Promise<string> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    const key = getEncryptionKey();
    const docRef = doc(getUserFoldersRef());
    const encryptedName = await encryptPassword(name, key, folderNameAad(uid, docRef.id));
    const now = Timestamp.now();

    await setDoc(docRef, {
        name: encryptedName,
        parentId,
        createdAt: now,
        updatedAt: now,
    });
    invalidateFolderCountCache();
    return docRef.id;
}

export async function renameFolder(id: string, newName: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    const key = getEncryptionKey();
    const encryptedName = await encryptPassword(newName, key, folderNameAad(uid, id));

    const docRef = doc(db, "users", uid, "folders", id);
    await updateDoc(docRef, {
        name: encryptedName,
        updatedAt: Timestamp.now(),
    });
}

export async function updateFolderColor(id: string, color: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const docRef = doc(db, "users", uid, "folders", id);
    await updateDoc(docRef, {
        color: color,
        updatedAt: Timestamp.now(),
    });
}

export async function deleteFolder(id: string): Promise<void> {
    // Basic deletion (does not recursively delete children for simplicity, 
    // in a real app you'd want a Cloud Function or recursive batch delete)
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    // Recursively delete subfolders
    const subfoldersQuery = query(getUserFoldersRef(), where("parentId", "==", id));
    const subfoldersSnap = await getDocs(subfoldersQuery);
    for (const subDoc of subfoldersSnap.docs) {
        await deleteFolder(subDoc.id);
    }

    // Delete all files inside this folder and decrement storageUsed
    const filesQuery = query(getUserFilesRef(), where("folderId", "==", id));
    const filesSnap = await getDocs(filesQuery);
    for (const fileDoc of filesSnap.docs) {
        const data = fileDoc.data();
        if (data.storagePath) {
            try {
                await deleteObject(ref(storage, data.storagePath));
            } catch (err) {
                console.warn("Failed to delete storage object:", err);
            }
        }
        await deleteDoc(fileDoc.ref);
        if (data.size) {
            await updateDoc(doc(db, "users", uid), {
                storageUsed: increment(-data.size)
            });
        }
    }

    const docRef = doc(db, "users", uid, "folders", id);
    await deleteDoc(docRef);
    invalidateFolderCountCache();
    if (filesSnap.docs.length > 0) {
        notifyVaultFilesUpdated();
    }
}

// ─── Files ───────────────────────────────────────────────────────────────

export function subscribeToFiles(folderId: string | null = null, callback: (files: VaultFile[]) => void): () => void {
    const key = getEncryptionKey();
    const uid = auth.currentUser?.uid;
    if (!key || !uid) return () => {};

    let cancelled = false;
    let latestSeq = 0;
    const q = query(getUserFilesRef(), where("folderId", "==", folderId));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const seq = ++latestSeq;
        const files: VaultFile[] = [];
        for (const docSnap of snapshot.docs) {
            if (cancelled || seq !== latestSeq) return;
            const data = docSnap.data();
            let decryptedName = "";
            let decryptedType = "";
            try {
                decryptedName = await decryptPassword(data.name, key, fileFieldAad(uid, docSnap.id, "name"));
                decryptedType = await decryptPassword(data.type, key, fileFieldAad(uid, docSnap.id, "type"));
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
        if (!cancelled && seq === latestSeq) {
            callback(files.sort((a, b) => a.name.localeCompare(b.name)));
        }
    }, (error) => {
        console.error("Files subscription error:", error);
    });

    return () => {
        cancelled = true;
        unsubscribe();
    };
}

export async function getFilesInFolder(folderId: string | null): Promise<VaultFile[]> {
    const key = getEncryptionKey();
    const uid = auth.currentUser?.uid;
    if (!key || !uid) return [];

    const q = query(getUserFilesRef(), where("folderId", "==", folderId));
    const snapshot = await getDocs(q);

    const files: VaultFile[] = [];
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let decryptedName = "";
        let decryptedType = "";
        try {
            decryptedName = await decryptPassword(data.name, key, fileFieldAad(uid, docSnap.id, "name"));
            decryptedType = await decryptPassword(data.type, key, fileFieldAad(uid, docSnap.id, "type"));
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
    return files;
}

export async function uploadVaultFile(
    file: File,
    folderId: string | null = null,
    onProgress?: (progress: number) => void
): Promise<string> {
    const key = getEncryptionKey();
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const fileId = crypto.randomUUID();
    const storagePath = `users/${uid}/files/${fileId}`;

    // 1. Encrypt Metadata bound to file ID
    const encryptedName = await encryptPassword(file.name, key, fileFieldAad(uid, fileId, "name"));
    const encryptedType = await encryptPassword(
        file.type || "application/octet-stream",
        key,
        fileFieldAad(uid, fileId, "type")
    );

    // 2. Chunk-encrypt File directly from Blob slices to bound RAM usage
    const encryptedBlob = await encryptFile(file, key, storagePath);

    // 3. Upload to Firebase Storage
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
                // 4. Save Metadata to Firestore using fileId so doc ID matches AAD binding
                try {
                    const now = Timestamp.now();
                    const fileDocRef = doc(getUserFilesRef(), fileId);
                    await setDoc(fileDocRef, {
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
                    invalidateFolderCountCache();
                    notifyVaultFilesUpdated();

                    resolve(fileId);
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

    // 1. Encrypt File Contents (respecting byteOffset/byteLength if Uint8Array view)
    const dataBlob = fileData instanceof Uint8Array
        ? new Blob([fileData.slice()])
        : new Blob([fileData]);
    const encryptedBlob = await encryptFile(dataBlob, key, existingStoragePath);

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
                    notifyVaultFilesUpdated();
                    
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

    // 3. Decrypt the blob (chunked FSENC1 binds storagePath; legacy files decrypt cleanly)
    const decryptedBlob = await decryptFile(encryptedBlob, key, vaultFile.type, vaultFile.storagePath);
    return decryptedBlob;
}

export async function renameVaultFile(id: string, newName: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    const key = getEncryptionKey();
    const encryptedName = await encryptPassword(newName, key, fileFieldAad(uid, id, "name"));

    const docRef = doc(db, "users", uid, "files", id);
    await updateDoc(docRef, {
        name: encryptedName,
        updatedAt: Timestamp.now(),
    });
}

export async function deleteVaultFile(vaultFile: VaultFile): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    // 1. Delete from Storage
    const storageRef = ref(storage, vaultFile.storagePath);
    try {
        await deleteObject(storageRef);
    } catch (err) {
        console.warn("Storage object already removed or inaccessible:", err);
    }

    // 2. Delete from Firestore
    const docRef = doc(db, "users", uid, "files", vaultFile.id);
    await deleteDoc(docRef);

    // 3. Update user's storage usage
    await updateDoc(doc(db, "users", uid), {
        storageUsed: increment(-vaultFile.size)
    });
    invalidateFolderCountCache();
    notifyVaultFilesUpdated();
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
    invalidateFolderCountCache();
}

export async function moveVaultFile(id: string, newFolderId: string | null): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const docRef = doc(db, "users", uid, "files", id);
    await updateDoc(docRef, {
        folderId: newFolderId,
        updatedAt: Timestamp.now(),
    });
    invalidateFolderCountCache();
}