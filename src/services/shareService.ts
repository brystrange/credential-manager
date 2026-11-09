import { httpsCallable } from "firebase/functions";
import { ref, uploadBytesResumable } from "firebase/storage";
import { auth, functions, storage } from "../firebaseConfig";
import { getEncryptionKey } from "./authService";
import {
    encryptPassword,
    decryptPassword,
    encryptFile,
    decryptFile,
    generateSharingKeyPair,
    exportPublicKeyJwk,
    importPublicKeyJwk,
    exportPrivateKeyHex,
    importPrivateKeyHex,
    generateShareKey,
    wrapShareKey,
    unwrapShareKey,
} from "./crypto";
import { downloadVaultFile, getAllFolders, getFilesInFolder } from "./fileService";
import type { VaultFile, VaultFolder } from "./fileService";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ShareRecipient {
    uid: string;
    email: string;
    displayName: string;
    publicKeyJwk: string | null;
    favorite?: boolean;
}

export interface ShareContact extends ShareRecipient {
    favorite: boolean;
    shareCount: number;
    lastSharedAt: number | null;
}

export interface ShareGroup {
    id: string;
    name: string;
    memberUids: string[];
}

export interface SharedFileEntry {
    storagePath: string;
    name: string;
    type: string;
    /** Path relative to the shared folder root (e.g. "Sub/Report.pdf"). Equals name for single files. */
    path: string;
    size: number;
}

export interface SharedItem {
    id: string;
    isSender: boolean;
    senderEmail: string;
    senderName: string;
    itemType: "file" | "folder";
    name: string;
    files: SharedFileEntry[];
    recipients: { uid: string; email: string; displayName: string }[];
    createdAt: Date;
    /** Decrypted per-share key (kept in memory only). */
    shareKey: CryptoKey | null;
}

export type ShareableItem =
    | { kind: "file"; file: VaultFile }
    | { kind: "folder"; folder: VaultFolder }
    | { kind: "shared"; share: SharedItem; fileEntry?: SharedFileEntry };

// ─── Callable helpers ────────────────────────────────────────────────────────

function call<Req, Res>(name: string) {
    return async (data: Req): Promise<Res> => {
        const fn = httpsCallable<Req, Res>(functions, name);
        const result = await fn(data);
        return result.data;
    };
}

/** Extracts a user-friendly message from a Firebase callable error. */
export function shareErrorMessage(err: unknown): string {
    const e = err as { code?: string; message?: string };
    if (e?.code === "functions/not-found" || /not found/i.test(e?.message || "")) {
        return "File sharing is not available yet. Please try again later.";
    }
    if (e?.code === "functions/internal" || e?.message === "internal") {
        return "Unable to connect to sharing service. Please try again in a moment.";
    }
    return e?.message?.replace(/^.*?:\s*/, "") || "Something went wrong. Please try again.";
}

// ─── Sharing key pair (lazy, cached per signed-in user) ─────────────────────

let cachedUid: string | null = null;
let cachedPrivateKey: CryptoKey | null = null;
let cachedPublicKeyJwk: string | null = null;
let ensurePromise: Promise<void> | null = null;

export function clearSharingKeys(): void {
    cachedUid = null;
    cachedPrivateKey = null;
    cachedPublicKeyJwk = null;
    ensurePromise = null;
}

function resetCacheIfUserChanged() {
    const uid = auth.currentUser?.uid ?? null;
    if (uid !== cachedUid) {
        clearSharingKeys();
        cachedUid = uid;
    }
}

async function loadOrCreateSharingKeys(): Promise<void> {
    const masterKey = getEncryptionKey();
    const getKey = call<void, { key: { publicKeyJwk: string; encryptedPrivateKey: string } | null }>("getSharingKey");

    let existing = (await getKey(undefined)).key;

    if (!existing) {
        const pair = await generateSharingKeyPair();
        const publicKeyJwk = await exportPublicKeyJwk(pair.publicKey);
        const privateHex = await exportPrivateKeyHex(pair.privateKey);
        const encryptedPrivateKey = await encryptPassword(privateHex, masterKey);

        const setKey = call<{ publicKeyJwk: string; encryptedPrivateKey: string }, { created: boolean }>("setSharingKey");
        const { created } = await setKey({ publicKeyJwk, encryptedPrivateKey });
        if (created) {
            existing = { publicKeyJwk, encryptedPrivateKey };
        } else {
            // Another session registered a key first — use that one.
            existing = (await getKey(undefined)).key;
            if (!existing) throw new Error("Unable to set up file sharing keys.");
        }
    }

    const privateHex = await decryptPassword(existing.encryptedPrivateKey, masterKey);
    cachedPrivateKey = await importPrivateKeyHex(privateHex);
    cachedPublicKeyJwk = existing.publicKeyJwk;
}

/**
 * Makes sure the signed-in user has a sharing key pair so they can send and
 * receive shared files. Safe to call repeatedly. Requires an unlocked vault.
 */
export async function ensureSharingKeys(): Promise<void> {
    resetCacheIfUserChanged();
    if (cachedPrivateKey && cachedPublicKeyJwk) return;
    if (!ensurePromise) {
        ensurePromise = loadOrCreateSharingKeys().catch((err) => {
            ensurePromise = null;
            throw err;
        });
    }
    return ensurePromise;
}

// ─── Recipients, favorites & groups ─────────────────────────────────────────

export async function lookupRecipient(email: string): Promise<ShareRecipient | null> {
    const fn = call<{ email: string }, { found: boolean; recipient?: ShareRecipient }>("lookupShareRecipient");
    const res = await fn({ email: email.trim().toLowerCase() });
    return res.found && res.recipient ? res.recipient : null;
}

export async function getShareContacts(): Promise<{ contacts: ShareContact[]; groups: ShareGroup[] }> {
    const fn = call<void, { contacts: ShareContact[]; groups: ShareGroup[] }>("getShareContacts");
    return await fn(undefined);
}

export async function setFavoriteRecipient(recipientUid: string, favorite: boolean): Promise<void> {
    await call<{ recipientUid: string; favorite: boolean }, { ok: boolean }>("updateShareContact")({ recipientUid, favorite });
}

export async function saveShareGroup(name: string, memberUids: string[], groupId?: string): Promise<string> {
    const res = await call<{ name: string; memberUids: string[]; groupId?: string }, { id: string }>("saveShareGroup")({
        name,
        memberUids,
        groupId,
    });
    return res.id;
}

export async function deleteShareGroup(groupId: string): Promise<void> {
    await call<{ groupId: string }, { ok: boolean }>("deleteShareGroup")({ groupId });
}

// ─── Sharing ─────────────────────────────────────────────────────────────────

interface CollectedFile {
    file?: VaultFile;
    sharedFile?: SharedFileEntry;
    share?: SharedItem;
    name: string;
    size: number;
    type: string;
    relativePath: string;
}

async function collectFolderFiles(folder: VaultFolder): Promise<{ file: VaultFile; relativePath: string }[]> {
    const allFolders = await getAllFolders();
    const results: { file: VaultFile; relativePath: string }[] = [];

    const walk = async (folderId: string, prefix: string) => {
        const files = await getFilesInFolder(folderId);
        files.forEach((f) => results.push({ file: f, relativePath: prefix ? `${prefix}/${f.name}` : f.name }));
        const children = allFolders.filter((f) => f.parentId === folderId);
        for (const child of children) {
            await walk(child.id, prefix ? `${prefix}/${child.name}` : child.name);
        }
    };

    await walk(folder.id, "");
    return results;
}

function uploadBlob(path: string, blob: Blob, onBytes: (bytes: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage, path), blob);
        task.on(
            "state_changed",
            (snap) => onBytes(snap.bytesTransferred),
            reject,
            () => resolve()
        );
    });
}

/**
 * Shares the given files/folders with the selected recipients.
 * Each item is decrypted locally, re-encrypted with a fresh share key and
 * uploaded; the share key is wrapped for every recipient (and the sender).
 */
export async function shareItems(
    items: ShareableItem[],
    recipients: ShareRecipient[],
    onProgress?: (percent: number, label: string) => void
): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    if (recipients.length === 0) throw new Error("Choose at least one recipient.");

    const missingKey = recipients.find((r) => !r.publicKeyJwk);
    if (missingKey) {
        throw new Error(`${missingKey.email} hasn't registered their sharing keys yet. Please sign in to this account once to activate end-to-end encryption.`);
    }

    await ensureSharingKeys();
    const myPublicKey = await importPublicKeyJwk(cachedPublicKeyJwk!);
    const recipientKeys = await Promise.all(
        recipients.map(async (r) => ({ uid: r.uid, key: await importPublicKeyJwk(r.publicKeyJwk!) }))
    );

    // Resolve all files first so progress can be reported across everything.
    const plans: { item: ShareableItem; name: string; itemType: "file" | "folder"; files: CollectedFile[] }[] = [];
    for (const item of items) {
        if (item.kind === "file") {
            plans.push({
                item,
                name: item.file.name,
                itemType: "file",
                files: [{ file: item.file, name: item.file.name, size: item.file.size, type: item.file.type, relativePath: item.file.name }]
            });
        } else if (item.kind === "folder") {
            const files = await collectFolderFiles(item.folder);
            if (files.length === 0) throw new Error(`Folder "${item.folder.name}" is empty.`);
            plans.push({
                item,
                name: item.folder.name,
                itemType: "folder",
                files: files.map(f => ({ file: f.file, name: f.file.name, size: f.file.size, type: f.file.type, relativePath: f.relativePath }))
            });
        } else if (item.kind === "shared") {
            const share = item.share;
            if (item.fileEntry) {
                plans.push({
                    item,
                    name: item.fileEntry.name,
                    itemType: "file",
                    files: [{
                        sharedFile: item.fileEntry,
                        share,
                        name: item.fileEntry.name,
                        size: item.fileEntry.size,
                        type: item.fileEntry.type,
                        relativePath: item.fileEntry.name
                    }]
                });
            } else if (share.itemType === "file" && share.files[0]) {
                plans.push({
                    item,
                    name: share.name,
                    itemType: "file",
                    files: [{
                        sharedFile: share.files[0],
                        share,
                        name: share.files[0].name,
                        size: share.files[0].size,
                        type: share.files[0].type,
                        relativePath: share.files[0].name
                    }]
                });
            } else {
                if (share.files.length === 0) throw new Error(`Folder "${share.name}" is empty.`);
                plans.push({
                    item,
                    name: share.name,
                    itemType: "folder",
                    files: share.files.map(f => ({
                        sharedFile: f,
                        share,
                        name: f.name,
                        size: f.size,
                        type: f.type,
                        relativePath: f.path || f.name
                    }))
                });
            }
        }
    }

    const totalBytes = plans.reduce((sum, p) => sum + p.files.reduce((s, f) => s + (f.size || 0), 0), 0) || 1;
    let doneBytes = 0;

    for (const plan of plans) {
        const shareId = crypto.randomUUID();
        const shareKey = await generateShareKey();
        const uploaded: {
            storagePath: string;
            encryptedName: string;
            encryptedType: string;
            encryptedPath: string;
            size: number;
        }[] = [];

        for (const cf of plan.files) {
            onProgress?.(Math.min(99, (doneBytes / totalBytes) * 100), `Sharing ${cf.name}…`);
            const plainBlob = cf.file ? await downloadVaultFile(cf.file) : await downloadSharedFile(cf.share!, cf.sharedFile!);
            const encryptedBlob = await encryptFile(await plainBlob.arrayBuffer(), shareKey);
            const storagePath = `users/${uid}/shared/${shareId}/${crypto.randomUUID()}`;
            const base = doneBytes;

            await uploadBlob(storagePath, encryptedBlob, (bytes) => {
                const fraction = encryptedBlob.size > 0 ? bytes / encryptedBlob.size : 1;
                onProgress?.(Math.min(99, ((base + fraction * cf.size) / totalBytes) * 100), `Sharing ${cf.name}…`);
            });
            doneBytes += cf.size || 0;

            uploaded.push({
                storagePath,
                encryptedName: await encryptPassword(cf.name, shareKey),
                encryptedType: await encryptPassword(cf.type || "application/octet-stream", shareKey),
                encryptedPath: await encryptPassword(cf.relativePath, shareKey),
                size: cf.size || 0,
            });
        }

        const wrappedKeys: Record<string, string> = { [uid]: await wrapShareKey(shareKey, myPublicKey) };
        for (const rk of recipientKeys) {
            wrappedKeys[rk.uid] = await wrapShareKey(shareKey, rk.key);
        }

        await call<unknown, { ok: boolean }>("createShare")({
            shareId,
            itemType: plan.itemType,
            encryptedName: await encryptPassword(plan.name, shareKey),
            files: uploaded,
            recipientUids: recipients.map((r) => r.uid),
            wrappedKeys,
        });
    }

    onProgress?.(100, "Shared");
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("shared-files-updated"));
    }
}

// ─── Listing, downloading & removing shares ─────────────────────────────────

interface RawShare {
    id: string;
    isSender: boolean;
    senderEmail: string;
    senderName: string;
    itemType: "file" | "folder";
    encryptedName: string;
    files: { storagePath: string; encryptedName: string; encryptedType: string; encryptedPath: string; size: number }[];
    recipients: { uid: string; email: string; displayName: string }[];
    wrappedKey: string | null;
    createdAt: number;
}

async function safeDecrypt(value: string, key: CryptoKey | null, fallback: string): Promise<string> {
    if (!key) return fallback;
    try {
        return await decryptPassword(value, key);
    } catch {
        return fallback;
    }
}

async function decodeShare(raw: RawShare): Promise<SharedItem> {
    let shareKey: CryptoKey | null = null;
    if (raw.wrappedKey && cachedPrivateKey) {
        try {
            shareKey = await unwrapShareKey(raw.wrappedKey, cachedPrivateKey);
        } catch {
            shareKey = null;
        }
    }

    const files: SharedFileEntry[] = await Promise.all(
        raw.files.map(async (f) => {
            const name = await safeDecrypt(f.encryptedName, shareKey, "[Encrypted]");
            return {
                storagePath: f.storagePath,
                name,
                type: await safeDecrypt(f.encryptedType, shareKey, "application/octet-stream"),
                path: await safeDecrypt(f.encryptedPath, shareKey, name),
                size: f.size,
            };
        })
    );

    return {
        id: raw.id,
        isSender: raw.isSender,
        senderEmail: raw.senderEmail,
        senderName: raw.senderName,
        itemType: raw.itemType,
        name: await safeDecrypt(raw.encryptedName, shareKey, "[Encrypted]"),
        files: files.sort((a, b) => a.path.localeCompare(b.path)),
        recipients: raw.recipients,
        createdAt: new Date(raw.createdAt),
        shareKey,
    };
}

export async function listShares(): Promise<{ received: SharedItem[]; sent: SharedItem[] }> {
    await ensureSharingKeys();
    const res = await call<void, { received: RawShare[]; sent: RawShare[] }>("listShares")(undefined);
    const [received, sent] = await Promise.all([
        Promise.all(res.received.map(decodeShare)),
        Promise.all(res.sent.map(decodeShare)),
    ]);
    const byDate = (a: SharedItem, b: SharedItem) => b.createdAt.getTime() - a.createdAt.getTime();
    return { received: received.sort(byDate), sent: sent.sort(byDate) };
}

export async function downloadSharedFile(share: SharedItem, file: SharedFileEntry): Promise<Blob> {
    if (!share.shareKey) throw new Error("Unable to decrypt this shared item.");
    const { url } = await call<{ shareId: string; storagePath: string }, { url: string }>("getSharedFileUrl")({
        shareId: share.id,
        storagePath: file.storagePath,
    });
    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to download shared file.");
    return await decryptFile(await response.blob(), share.shareKey, file.type);
}

/** Sender: revokes the share for everyone. Recipient: removes it from their list. */
export async function removeShare(shareId: string): Promise<void> {
    await call<{ shareId: string }, { ok: boolean }>("deleteShare")({ shareId });
    if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("shared-files-updated"));
    }
}

