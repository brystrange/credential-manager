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

import { onSnapshot } from "firebase/firestore";

// Helper function to try decrypting names
async function tryDecryptName(encryptedName: string, key: CryptoKey): Promise<string> {
    try {
        return await decryptPassword(encryptedName, key);
    } catch {
        return "[Encrypted]";
    }
}

// ─── Folders ─────────────────────────────────────────────────────────────

export function subscribeToFolders(parentId: string | null = null, callback: (folders: VaultFolder[]) => void): () => void {
    const key = getEncryptionKey();
    if (!key) return () => {};

    const q = query(getUserFoldersRef(), where("parentId", "==", parentId));
    return onSnapshot(q, async (snapshot) => {
        const folders: VaultFolder[] = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            const decryptedName = await tryDecryptName(data.name, key);
            folders.push({
                id: docSnap.id,
                name: decryptedName,
                parentId: data.parentId,
                color: data.color || undefined,
                createdAt: (data.createdAt as Timestamp).toDate(),
                updatedAt: (data.updatedAt as Timestamp).toDate(),
            });
        }
        callback(folders.sort((a, b) => a.name.localeCompare(b.name)));
    }, (error) => {
        console.error("Folders subscription error:", error);
    });
}

export async function getFolderItemCount(folderId: string): Promise<number> {
    const folderCountQuery = query(getUserFoldersRef(), where("parentId", "==", folderId));
    const fileCountQuery = query(getUserFilesRef(), where("folderId", "==", folderId));
    
    const [folderSnap, fileSnap] = await Promise.all([
        getCountFromServer(folderCountQuery),
        getCountFromServer(fileCountQuery)
    ]);
    return folderSnap.data().count + fileSnap.data().count;
}

export async function getAllFolders(): Promise<VaultFolder[]> {
    const key = getEncryptionKey();
    if (!key) return [];
    
    const snapshot = await getDocs(getUserFoldersRef());

    const folders: VaultFolder[] = [];
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const decryptedName = await tryDecryptName(data.name, key);
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
    const key = getEncryptionKey();
    const encryptedName = await encryptPassword(name, key);
    const now = Timestamp.now();

    const docRef = await addDoc(getUserFoldersRef(), {
        name: encryptedName,
        parentId,
        createdAt: now,
        updatedAt: now,
    });
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
    const docRef = doc(db, "users", uid, "folders", id);
    await deleteDoc(docRef);
}

// ─── Files ───────────────────────────────────────────────────────────────

export function subscribeToFiles(folderId: string | null = null, callback: (files: VaultFile[]) => void): () => void {
    const key = getEncryptionKey();
    if (!key) return () => {};

    const q = query(getUserFilesRef(), where("folderId", "==", folderId));
    return onSnapshot(q, async (snapshot) => {
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
        callback(files.sort((a, b) => a.name.localeCompare(b.name)));
    }, (error) => {
        console.error("Files subscription error:", error);
    });
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
}

export async function moveVaultFile(id: string, newFolderId: string | null): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const docRef = doc(db, "users", uid, "files", id);
    await updateDoc(docRef, {
        folderId: newFolderId,
        updatedAt: Timestamp.now(),
    });
}
