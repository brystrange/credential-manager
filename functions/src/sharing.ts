import * as admin from "firebase-admin";
import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { randomUUID } from "crypto";

// ─── File Sharing ────────────────────────────────────────────────────────────
// All cross-user reads/writes happen here through the Admin SDK, with explicit
// authorization checks. Firestore/Storage security rules stay owner-only.
//
// Data model (server-only collections, clients have no direct access):
//   sharingKeys/{uid}                      → { publicKeyJwk, encryptedPrivateKey }
//   shares/{shareId}                       → share metadata (ciphertext names)
//   shareContacts/{uid}/contacts/{rcptUid} → favorites + frequency stats
//   shareContacts/{uid}/groups/{groupId}   → custom recipient groups
//
// File contents and names are end-to-end encrypted on the client with a random
// per-share AES key. That key is wrapped with each recipient's RSA-OAEP public
// key, so the server never sees plaintext data or the share key.

const MAX_RECIPIENTS = 50;
const MAX_FILES_PER_SHARE = 1000;
const MAX_GROUP_NAME = 60;

const db = () => admin.firestore();

function requireVerifiedAuth(request: CallableRequest): string {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    if (request.auth.token.email_verified !== true) {
        throw new HttpsError("permission-denied", "Please verify your email address first.");
    }
    return request.auth.uid;
}

/** True when the user is an active Pro subscriber or manually exempted by an admin. */
async function isUserPro(uid: string): Promise<boolean> {
    try {
        const userRecord = await admin.auth().getUser(uid);
        const email = userRecord.email?.trim().toLowerCase();
        if (email) {
            const exemptSnap = await db().collection("exemptions").doc(email).get();
            if (exemptSnap.exists && exemptSnap.data()?.exempt !== false) return true;
        }
    } catch {
        // fall through to subscription check
    }

    const userDoc = await db().collection("users").doc(uid).get();
    const data = userDoc.data() || {};
    if (data.plan !== "pro") return false;
    const status = data.subscriptionStatus;
    if (status !== "active" && status !== "on_trial" && status !== "on-trial") return false;
    const periodEnd: Date | null = data.currentPeriodEnd?.toDate?.() ?? null;
    return periodEnd === null || periodEnd > new Date();
}

async function requirePro(uid: string): Promise<void> {
    if (!(await isUserPro(uid))) {
        throw new HttpsError(
            "permission-denied",
            "File sharing is available for Pro tier users only. Upgrade to Pro to share files."
        );
    }
}

function isNonEmptyString(v: unknown, max: number): v is string {
    return typeof v === "string" && v.length > 0 && v.length <= max;
}

interface UserSummary {
    uid: string;
    email: string;
    displayName: string;
}

async function getUserSummary(uid: string): Promise<UserSummary | null> {
    try {
        const rec = await admin.auth().getUser(uid);
        return {
            uid: rec.uid,
            email: (rec.email || "").toLowerCase(),
            displayName: rec.displayName || (rec.email || "").split("@")[0] || "User",
        };
    } catch {
        return null;
    }
}

async function getPublicKeys(uids: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    if (uids.length === 0) return result;
    const refs = uids.map((u) => db().collection("sharingKeys").doc(u));
    const snaps = await db().getAll(...refs);
    snaps.forEach((s) => {
        const pk = s.data()?.publicKeyJwk;
        if (s.exists && typeof pk === "string") result[s.id] = pk;
    });
    return result;
}

function bucket() {
    return admin.storage().bucket();
}

async function deleteShareObjects(files: { storagePath?: string }[]): Promise<void> {
    await Promise.all(
        files.map(async (f) => {
            if (!f.storagePath) return;
            try {
                await bucket().file(f.storagePath).delete({ ignoreNotFound: true });
            } catch (err) {
                console.warn(`Failed to delete shared object ${f.storagePath}:`, err);
            }
        })
    );
}

// ─── Sharing key pair (per user) ────────────────────────────────────────────

export const getSharingKey = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    const snap = await db().collection("sharingKeys").doc(uid).get();
    if (!snap.exists) return { key: null };
    const data = snap.data() || {};
    return {
        key: {
            publicKeyJwk: data.publicKeyJwk as string,
            encryptedPrivateKey: data.encryptedPrivateKey as string,
        },
    };
});

export const setSharingKey = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { publicKeyJwk, encryptedPrivateKey } = request.data || {};

    if (!isNonEmptyString(publicKeyJwk, 4000) || !isNonEmptyString(encryptedPrivateKey, 10000)) {
        throw new HttpsError("invalid-argument", "Invalid sharing key payload.");
    }
    try {
        const jwk = JSON.parse(publicKeyJwk);
        if (jwk.kty !== "RSA" || typeof jwk.n !== "string" || typeof jwk.e !== "string" || jwk.d) {
            throw new Error("bad jwk");
        }
    } catch {
        throw new HttpsError("invalid-argument", "Invalid public key.");
    }

    try {
        // create() fails if a key already exists — keys are never silently replaced.
        await db().collection("sharingKeys").doc(uid).create({
            publicKeyJwk,
            encryptedPrivateKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { created: true };
    } catch {
        return { created: false };
    }
});

// ─── Recipient lookup (exact email match, Pro only) ─────────────────────────
// Velocity tracking per user to prevent email enumeration: max 30 lookups per minute
const lookupTimestamps = new Map<string, number[]>();

function checkLookupRateLimit(uid: string): void {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxLookups = 30;

    let timestamps = lookupTimestamps.get(uid);
    if (!timestamps) {
        timestamps = [];
        lookupTimestamps.set(uid, timestamps);
    }

    timestamps = timestamps.filter((t) => now - t < windowMs);
    lookupTimestamps.set(uid, timestamps);

    if (timestamps.length >= maxLookups) {
        throw new HttpsError(
            "resource-exhausted",
            "Too many recipient lookups. Please wait a moment before trying again."
        );
    }

    timestamps.push(now);

    if (lookupTimestamps.size > 1000) {
        for (const [key, list] of lookupTimestamps.entries()) {
            if (list.length === 0 || now - list[list.length - 1] > windowMs) {
                lookupTimestamps.delete(key);
            }
        }
    }
}


export const lookupShareRecipient = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    await requirePro(uid);
    checkLookupRateLimit(uid);

    const rawEmail = request.data?.email;
    if (!isNonEmptyString(rawEmail, 320)) {
        throw new HttpsError("invalid-argument", "Enter a valid email address.");
    }
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpsError("invalid-argument", "Enter a valid email address.");
    }

    let rec: admin.auth.UserRecord;
    try {
        rec = await admin.auth().getUserByEmail(email);
    } catch {
        return { found: false };
    }
    if (rec.uid === uid) {
        throw new HttpsError("invalid-argument", "You cannot share files with yourself.");
    }

    const userDoc = await db().collection("users").doc(rec.uid).get();
    if (!userDoc.exists) return { found: false };

    const keys = await getPublicKeys([rec.uid]);
    const contactSnap = await db()
        .collection("shareContacts").doc(uid)
        .collection("contacts").doc(rec.uid)
        .get();

    return {
        found: true,
        recipient: {
            uid: rec.uid,
            email: (rec.email || email).toLowerCase(),
            displayName: rec.displayName || email.split("@")[0],
            publicKeyJwk: keys[rec.uid] ?? null,
            favorite: contactSnap.data()?.favorite === true,
        },
    };
});

// ─── Contacts: favorites, frequent recipients, custom groups ────────────────

export const getShareContacts = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    const base = db().collection("shareContacts").doc(uid);

    const [contactsSnap, groupsSnap] = await Promise.all([
        base.collection("contacts").limit(300).get(),
        base.collection("groups").limit(100).get(),
    ]);

    const contactUids = contactsSnap.docs.map((d) => d.id);
    const keys = await getPublicKeys(contactUids);

    const contacts = contactsSnap.docs.map((d) => {
        const c = d.data();
        return {
            uid: d.id,
            email: c.email || "",
            displayName: c.displayName || "",
            favorite: c.favorite === true,
            shareCount: typeof c.shareCount === "number" ? c.shareCount : 0,
            lastSharedAt: c.lastSharedAt?.toMillis?.() ?? null,
            publicKeyJwk: keys[d.id] ?? null,
        };
    });

    const groups = groupsSnap.docs.map((d) => {
        const g = d.data();
        return {
            id: d.id,
            name: g.name || "Group",
            memberUids: Array.isArray(g.memberUids) ? g.memberUids : [],
        };
    });

    return { contacts, groups };
});

async function upsertContacts(ownerUid: string, uids: string[]): Promise<UserSummary[]> {
    const summaries = await Promise.all(uids.map((u) => getUserSummary(u)));
    const valid = summaries.filter((s): s is UserSummary => s !== null);
    const batch = db().batch();
    valid.forEach((s) => {
        const ref = db().collection("shareContacts").doc(ownerUid).collection("contacts").doc(s.uid);
        batch.set(ref, { email: s.email, displayName: s.displayName }, { merge: true });
    });
    await batch.commit();
    return valid;
}

export const updateShareContact = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { recipientUid, favorite } = request.data || {};
    if (!isNonEmptyString(recipientUid, 128) || typeof favorite !== "boolean") {
        throw new HttpsError("invalid-argument", "Invalid contact update.");
    }
    if (recipientUid === uid) throw new HttpsError("invalid-argument", "Invalid recipient.");

    const valid = await upsertContacts(uid, [recipientUid]);
    if (valid.length === 0) throw new HttpsError("not-found", "Recipient not found.");

    await db()
        .collection("shareContacts").doc(uid)
        .collection("contacts").doc(recipientUid)
        .set({ favorite, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
});

export const saveShareGroup = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    await requirePro(uid);
    const { groupId, name, memberUids } = request.data || {};

    if (!isNonEmptyString(name, MAX_GROUP_NAME) || !name.trim()) {
        throw new HttpsError("invalid-argument", `Group name must be 1–${MAX_GROUP_NAME} characters.`);
    }
    if (!Array.isArray(memberUids) || memberUids.length === 0 || memberUids.length > MAX_RECIPIENTS) {
        throw new HttpsError("invalid-argument", `A group needs 1–${MAX_RECIPIENTS} members.`);
    }
    const unique = Array.from(new Set(memberUids.filter((m: unknown) => isNonEmptyString(m, 128) && m !== uid))) as string[];
    const valid = await upsertContacts(uid, unique);
    if (valid.length === 0) throw new HttpsError("invalid-argument", "No valid group members.");

    const groupsRef = db().collection("shareContacts").doc(uid).collection("groups");
    const id = isNonEmptyString(groupId, 128) ? groupId : groupsRef.doc().id;
    await groupsRef.doc(id).set({
        name: name.trim(),
        memberUids: valid.map((v) => v.uid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id };
});

export const deleteShareGroup = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { groupId } = request.data || {};
    if (!isNonEmptyString(groupId, 128)) throw new HttpsError("invalid-argument", "Invalid group.");
    await db().collection("shareContacts").doc(uid).collection("groups").doc(groupId).delete();
    return { ok: true };
});

// ─── Create / list / delete shares ──────────────────────────────────────────

interface ShareFileInput {
    storagePath: string;
    encryptedName: string;
    encryptedType: string;
    encryptedPath: string;
    size: number;
}

export const createShare = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    await requirePro(uid);

    const { shareId, itemType, encryptedName, files, recipientUids, wrappedKeys } = request.data || {};

    if (!isNonEmptyString(shareId, 64) || !/^[A-Za-z0-9-]{8,64}$/.test(shareId)) {
        throw new HttpsError("invalid-argument", "Invalid share id.");
    }
    if (itemType !== "file" && itemType !== "folder") {
        throw new HttpsError("invalid-argument", "Invalid item type.");
    }
    if (!isNonEmptyString(encryptedName, 4000)) {
        throw new HttpsError("invalid-argument", "Invalid item name.");
    }
    if (!Array.isArray(files) || files.length > MAX_FILES_PER_SHARE || (itemType === "file" && files.length !== 1)) {
        throw new HttpsError("invalid-argument", "Invalid file list.");
    }

    const pathPrefix = `users/${uid}/shared/${shareId}/`;
    const cleanFiles: ShareFileInput[] = files.map((f: Partial<ShareFileInput>) => {
        if (
            !isNonEmptyString(f?.storagePath, 512) ||
            !f.storagePath.startsWith(pathPrefix) ||
            f.storagePath.includes("..") ||
            !isNonEmptyString(f.encryptedName, 4000) ||
            !isNonEmptyString(f.encryptedType, 4000) ||
            !isNonEmptyString(f.encryptedPath, 8000) ||
            typeof f.size !== "number" || f.size < 0
        ) {
            throw new HttpsError("invalid-argument", "Invalid file entry.");
        }
        return {
            storagePath: f.storagePath,
            encryptedName: f.encryptedName,
            encryptedType: f.encryptedType,
            encryptedPath: f.encryptedPath,
            size: f.size,
        };
    });

    if (!Array.isArray(recipientUids) || recipientUids.length === 0 || recipientUids.length > MAX_RECIPIENTS) {
        throw new HttpsError("invalid-argument", `Choose 1–${MAX_RECIPIENTS} recipients.`);
    }
    const recipients = Array.from(new Set(recipientUids)) as string[];
    if (recipients.some((r) => !isNonEmptyString(r, 128) || r === uid)) {
        throw new HttpsError("invalid-argument", "Invalid recipient list.");
    }

    if (!wrappedKeys || typeof wrappedKeys !== "object") {
        throw new HttpsError("invalid-argument", "Missing encryption keys.");
    }
    const cleanWrappedKeys: Record<string, string> = {};
    for (const holder of recipients) {
        const wk = (wrappedKeys as Record<string, unknown>)[holder];
        if (!isNonEmptyString(wk, 4000)) {
            throw new HttpsError("invalid-argument", "Missing encryption key for a recipient.");
        }
        cleanWrappedKeys[holder] = wk;
    }

    // Recipients must exist and have registered a sharing key.
    const keys = await getPublicKeys(recipients);
    const missing = recipients.filter((r) => !keys[r]);
    if (missing.length > 0) {
        throw new HttpsError("failed-precondition", "One or more recipients cannot receive shared files yet.");
    }

    // Ensure the sender actually uploaded every referenced object.
    const existence = await Promise.all(cleanFiles.map((f) => bucket().file(f.storagePath).exists()));
    if (existence.some(([exists]) => !exists)) {
        throw new HttpsError("failed-precondition", "Some shared files were not uploaded.");
    }

    const recipientSummaries = await Promise.all(recipients.map((r) => getUserSummary(r)));
    const validRecipients = recipientSummaries.filter((s): s is UserSummary => s !== null);
    if (validRecipients.length !== recipients.length) {
        throw new HttpsError("not-found", "One or more recipients no longer exist.");
    }

    const shareSize = cleanFiles.reduce((sum, f) => sum + (f.size || 0), 0);

    // Verify each recipient has sufficient storage capacity for their independent copy
    for (const r of validRecipients) {
        const [isPro, currentUsage] = await Promise.all([
            isUserPro(r.uid),
            getUserStorageUsageBytes(r.uid),
        ]);
        const limit = isPro ? 5 * 1024 * 1024 * 1024 : 500 * 1024 * 1024;
        if (currentUsage + shareSize > limit) {
            await deleteShareObjects(cleanFiles).catch(() => {});
            throw new HttpsError(
                "failed-precondition",
                `Recipient ${r.displayName || r.email} has insufficient storage space.`
            );
        }
    }

    const existingHead = await db().collection("shares").doc(shareId).get();
    if (existingHead.exists) {
        throw new HttpsError("already-exists", "This share already exists.");
    }

    // Create an independent Storage copy and Firestore share doc owned by each recipient.
    const createdDocIds: string[] = [];
    const createdCopies: { storagePath?: string }[] = [];
    try {
        for (let idx = 0; idx < validRecipients.length; idx++) {
            const r = validRecipients[idx];
            const copyShareId = idx === 0 ? shareId : randomUUID();
            const copiedFiles: ShareFileInput[] = [];

            for (const f of cleanFiles) {
                const destPath = `users/${r.uid}/shared/${copyShareId}/${randomUUID()}`;
                await bucket().file(f.storagePath).copy(bucket().file(destPath));
                createdCopies.push({ storagePath: destPath });
                copiedFiles.push({
                    storagePath: destPath,
                    encryptedName: f.encryptedName,
                    encryptedType: f.encryptedType,
                    encryptedPath: f.encryptedPath,
                    size: f.size,
                });
            }

            await db().collection("shares").doc(copyShareId).create({
                ownerUid: r.uid,
                recipientUids: [r.uid],
                itemType,
                encryptedName,
                files: copiedFiles,
                wrappedKeys: { [r.uid]: cleanWrappedKeys[r.uid] },
                color: null,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            createdDocIds.push(copyShareId);
        }
    } catch (err) {
        await deleteShareObjects(createdCopies).catch(() => {});
        await Promise.all(createdDocIds.map((id) => db().collection("shares").doc(id).delete().catch(() => {})));
        throw err;
    }

    // Clean up temporary sender staging objects now that each recipient owns a copy.
    await deleteShareObjects(cleanFiles).catch((e) =>
        console.warn("Failed to delete staging share files:", e)
    );

    // Track frequent recipients and count copies toward each recipient's storage usage.
    const batch = db().batch();
    validRecipients.forEach((r) => {
        const ref = db().collection("shareContacts").doc(uid).collection("contacts").doc(r.uid);
        batch.set(ref, {
            email: r.email,
            displayName: r.displayName,
            shareCount: admin.firestore.FieldValue.increment(1),
            lastSharedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        if (shareSize > 0) {
            batch.set(
                db().collection("users").doc(r.uid),
                { storageUsed: admin.firestore.FieldValue.increment(shareSize) },
                { merge: true }
            );
        }
    });
    await batch.commit();

    return { ok: true, shareId };
});

async function getUserStorageUsageBytes(uid: string): Promise<number> {
    const [filesSnap, sharesSnap] = await Promise.all([
        db().collection("users").doc(uid).collection("files").get(),
        db().collection("shares").where("recipientUids", "array-contains", uid).get(),
    ]);
    const filesBytes = filesSnap.docs.reduce((sum, d) => sum + (Number(d.data().size) || 0), 0);
    const sharedBytes = sharesSnap.docs.reduce((sum, d) => {
        const files = (d.data().files as ShareFileInput[]) || [];
        return sum + files.reduce((fSum, f) => fSum + (Number(f.size) || 0), 0);
    }, 0);
    return filesBytes + sharedBytes;
}

/**
 * Ensures a share document is exclusively owned by `uid` as an independent copy.
 * Legacy single-recipient docs are promoted in-place; legacy multi-recipient docs
 * are forked into a dedicated document and isolated GCS objects for `uid`.
 */
async function ensureExclusiveRecipientShare(shareId: string, uid: string): Promise<{
    ref: FirebaseFirestore.DocumentReference;
    data: FirebaseFirestore.DocumentData;
    pathMap: Map<string, string>;
}> {
    const ref = db().collection("shares").doc(shareId);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new HttpsError("not-found", "Item not found.");
    }
    const s = snap.data() || {};
    const recipientUids: string[] = Array.isArray(s.recipientUids) ? s.recipientUids : [];
    const allowed = s.ownerUid === uid || recipientUids.includes(uid);
    if (!allowed) {
        throw new HttpsError("permission-denied", "You do not have access to this item.");
    }

    const existingFiles: ShareFileInput[] = Array.isArray(s.files) ? s.files : [];
    const pathMap = new Map<string, string>(existingFiles.map((f) => [f.storagePath, f.storagePath]));

    if (s.ownerUid === uid && recipientUids.length === 1 && !s.senderUid) {
        return { ref, data: s, pathMap };
    }

    const wrappedKeyForUser = (s.wrappedKeys || {})[uid];

    if (recipientUids.length <= 1) {
        const migratedFiles: ShareFileInput[] = [];
        const oldSenderPathsToDelete: { storagePath: string }[] = [];
        const newOwnerPrefix = `users/${uid}/shared/`;
        const copiedTemp: { storagePath: string }[] = [];

        try {
            for (const f of existingFiles) {
                if (f.storagePath.startsWith(newOwnerPrefix)) {
                    migratedFiles.push(f);
                } else {
                    const destPath = `users/${uid}/shared/${shareId}/${randomUUID()}`;
                    await bucket().file(f.storagePath).copy(bucket().file(destPath));
                    copiedTemp.push({ storagePath: destPath });
                    pathMap.set(f.storagePath, destPath);
                    oldSenderPathsToDelete.push({ storagePath: f.storagePath });
                    migratedFiles.push({ ...f, storagePath: destPath });
                }
            }
        } catch (err) {
            await deleteShareObjects(copiedTemp).catch(() => {});
            throw err;
        }

        const updatedFields: Record<string, unknown> = {
            ownerUid: uid,
            recipientUids: [uid],
            files: migratedFiles,
            wrappedKeys: wrappedKeyForUser ? { [uid]: wrappedKeyForUser } : (s.wrappedKeys || {}),
            senderUid: admin.firestore.FieldValue.delete(),
            senderEmail: admin.firestore.FieldValue.delete(),
            senderName: admin.firestore.FieldValue.delete(),
            recipients: admin.firestore.FieldValue.delete(),
        };
        await ref.update(updatedFields);
        if (oldSenderPathsToDelete.length > 0) {
            await deleteShareObjects(oldSenderPathsToDelete).catch(() => {});
        }
        return {
            ref,
            data: { ...s, ownerUid: uid, recipientUids: [uid], files: migratedFiles },
            pathMap,
        };
    }

    // Legacy multi-recipient share: fork an exclusive independent copy for uid
    const newShareId = randomUUID();
    const copiedFiles: ShareFileInput[] = [];
    const createdTemp: { storagePath: string }[] = [];
    try {
        for (const f of existingFiles) {
            const destPath = `users/${uid}/shared/${newShareId}/${randomUUID()}`;
            await bucket().file(f.storagePath).copy(bucket().file(destPath));
            createdTemp.push({ storagePath: destPath });
            pathMap.set(f.storagePath, destPath);
            copiedFiles.push({ ...f, storagePath: destPath });
        }
    } catch (err) {
        await deleteShareObjects(createdTemp).catch(() => {});
        throw err;
    }

    const newRef = db().collection("shares").doc(newShareId);
    const newData: FirebaseFirestore.DocumentData = {
        ownerUid: uid,
        recipientUids: [uid],
        itemType: s.itemType,
        encryptedName: s.encryptedName,
        files: copiedFiles,
        wrappedKeys: wrappedKeyForUser ? { [uid]: wrappedKeyForUser } : {},
        color: s.color || null,
        createdAt: s.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    };
    await newRef.create(newData);

    const remaining = recipientUids.filter((r) => r !== uid);
    await ref.update({
        recipientUids: remaining,
        recipients: (s.recipients || []).filter((r: { uid: string }) => r.uid !== uid),
        [`wrappedKeys.${uid}`]: admin.firestore.FieldValue.delete(),
    });

    return { ref: newRef, data: newData, pathMap };
}

export const listShares = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);

    const receivedSnap = await db()
        .collection("shares")
        .where("recipientUids", "array-contains", uid)
        .limit(500)
        .get();

    const toClient = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
        const s = d.data();
        return {
            id: d.id,
            itemType: s.itemType,
            encryptedName: s.encryptedName,
            color: s.color || undefined,
            files: (s.files || []).map((f: ShareFileInput) => ({
                storagePath: f.storagePath,
                encryptedName: f.encryptedName,
                encryptedType: f.encryptedType,
                encryptedPath: f.encryptedPath,
                size: f.size,
            })),
            wrappedKey: (s.wrappedKeys || {})[uid] ?? null,
            createdAt: s.createdAt?.toMillis?.() ?? Date.now(),
        };
    };

    return {
        received: receivedSnap.docs.map((d) => toClient(d)),
        sent: [],
    };
});

export const getSharedFileUrl = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { shareId, storagePath } = request.data || {};
    if (!isNonEmptyString(shareId, 64) || !isNonEmptyString(storagePath, 512)) {
        throw new HttpsError("invalid-argument", "Invalid request.");
    }

    const snap = await db().collection("shares").doc(shareId).get();
    if (!snap.exists) throw new HttpsError("not-found", "Item not found.");
    const s = snap.data() || {};
    const allowed = s.ownerUid === uid || (Array.isArray(s.recipientUids) && s.recipientUids.includes(uid));
    if (!allowed) throw new HttpsError("permission-denied", "You do not have access to this item.");
    if (!(s.files || []).some((f: ShareFileInput) => f.storagePath === storagePath)) {
        throw new HttpsError("not-found", "File not found.");
    }

    const file = bucket().file(storagePath);
    const [metadata] = await file.getMetadata();
    const custom = (metadata.metadata || {}) as Record<string, string>;
    let token = (custom.firebaseStorageDownloadTokens || "").split(",")[0];
    if (!token) {
        token = randomUUID();
        await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
    return { url };
});

export const updateShareItem = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { shareId, encryptedName, color, updatedFiles } = request.data || {};
    if (!isNonEmptyString(shareId, 64)) {
        throw new HttpsError("invalid-argument", "Invalid share id.");
    }

    const { ref, data, pathMap } = await ensureExclusiveRecipientShare(shareId, uid);
    const patch: Record<string, unknown> = {};

    if (encryptedName !== undefined) {
        if (!isNonEmptyString(encryptedName, 4000)) {
            throw new HttpsError("invalid-argument", "Invalid name.");
        }
        patch.encryptedName = encryptedName;
    }

    if (color !== undefined) {
        if (color !== null && (typeof color !== "string" || color.length > 32)) {
            throw new HttpsError("invalid-argument", "Invalid color.");
        }
        patch.color = color || null;
    }

    if (updatedFiles !== undefined) {
        if (!Array.isArray(updatedFiles) || updatedFiles.length > MAX_FILES_PER_SHARE) {
            throw new HttpsError("invalid-argument", "Invalid file updates.");
        }
        const updateByPath = new Map<string, { encryptedName?: string; encryptedPath?: string }>();
        for (const u of updatedFiles) {
            if (!u || !isNonEmptyString(u.storagePath, 512)) {
                throw new HttpsError("invalid-argument", "Invalid file update entry.");
            }
            const resolvedPath = pathMap.get(u.storagePath) ?? u.storagePath;
            const entryUpdate: { encryptedName?: string; encryptedPath?: string } = {};
            if (u.encryptedName !== undefined) {
                if (!isNonEmptyString(u.encryptedName, 4000)) {
                    throw new HttpsError("invalid-argument", "Invalid file name.");
                }
                entryUpdate.encryptedName = u.encryptedName;
            }
            if (u.encryptedPath !== undefined) {
                if (!isNonEmptyString(u.encryptedPath, 8000)) {
                    throw new HttpsError("invalid-argument", "Invalid file path.");
                }
                entryUpdate.encryptedPath = u.encryptedPath;
            }
            updateByPath.set(resolvedPath, entryUpdate);
        }

        const existingFiles: ShareFileInput[] = Array.isArray(data.files) ? data.files : [];
        patch.files = existingFiles.map((f) => {
            const upd = updateByPath.get(f.storagePath);
            if (!upd) return f;
            return {
                ...f,
                encryptedName: upd.encryptedName ?? f.encryptedName,
                encryptedPath: upd.encryptedPath ?? f.encryptedPath,
            };
        });
    }

    if (Object.keys(patch).length > 0) {
        await ref.update(patch);
    }

    return { ok: true, shareId: ref.id };
});

export const deleteSharedFiles = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { shareId, storagePaths } = request.data || {};
    if (!isNonEmptyString(shareId, 64)) {
        throw new HttpsError("invalid-argument", "Invalid share id.");
    }
    if (!Array.isArray(storagePaths) || storagePaths.length === 0 || storagePaths.length > MAX_FILES_PER_SHARE) {
        throw new HttpsError("invalid-argument", "Invalid files list.");
    }

    const { ref, data, pathMap } = await ensureExclusiveRecipientShare(shareId, uid);
    const targetPaths = new Set<string>(
        storagePaths
            .filter((p: unknown): p is string => isNonEmptyString(p, 512))
            .map((p) => pathMap.get(p) ?? p)
    );

    const existingFiles: ShareFileInput[] = Array.isArray(data.files) ? data.files : [];
    const toDelete = existingFiles.filter((f) => targetPaths.has(f.storagePath));
    const remaining = existingFiles.filter((f) => !targetPaths.has(f.storagePath));

    if (toDelete.length === 0) {
        return { ok: true, shareId: ref.id, remainingCount: existingFiles.length };
    }

    const freedSize = toDelete.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
    await deleteShareObjects(toDelete);

    if (remaining.length === 0 && data.itemType !== "folder") {
        await ref.delete();
    } else {
        await ref.update({ files: remaining });
    }

    if (freedSize > 0) {
        await db().collection("users").doc(uid).set(
            { storageUsed: admin.firestore.FieldValue.increment(-freedSize) },
            { merge: true }
        ).catch((e) => console.warn("Failed to decrement storage for recipient:", e));
    }

    return { ok: true, shareId: ref.id, remainingCount: remaining.length };
});

export const deleteShare = onCall(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { shareId } = request.data || {};
    if (!isNonEmptyString(shareId, 64)) throw new HttpsError("invalid-argument", "Invalid share id.");

    const ref = db().collection("shares").doc(shareId);
    const snap = await ref.get();
    if (!snap.exists) return { ok: true };
    const s = snap.data() || {};
    const recipientUids: string[] = Array.isArray(s.recipientUids) ? s.recipientUids : [];
    const shareSize = (s.files || []).reduce((sum: number, f: ShareFileInput) => sum + (Number(f.size) || 0), 0);

    const isOwner = s.ownerUid === uid || recipientUids.includes(uid);
    if (!isOwner) {
        throw new HttpsError("permission-denied", "You do not have access to this item.");
    }

    const remaining = recipientUids.filter((r) => r !== uid);
    if (remaining.length === 0) {
        await deleteShareObjects(s.files || []);
        await ref.delete();
    } else {
        await ref.update({
            recipientUids: remaining,
            recipients: (s.recipients || []).filter((r: { uid: string }) => r.uid !== uid),
            [`wrappedKeys.${uid}`]: admin.firestore.FieldValue.delete(),
        });
    }

    if (shareSize > 0) {
        await db().collection("users").doc(uid).set(
            { storageUsed: admin.firestore.FieldValue.increment(-shareSize) },
            { merge: true }
        ).catch((e) => console.warn("Failed to decrement storage for user:", e));
    }

    return { ok: true, revoked: false };
});

