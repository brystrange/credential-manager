"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteShare = exports.deleteSharedFiles = exports.updateShareItem = exports.getSharedFileUrl = exports.listShares = exports.createShare = exports.deleteShareGroup = exports.saveShareGroup = exports.updateShareContact = exports.getShareContacts = exports.lookupShareRecipient = exports.setSharingKey = exports.getSharingKey = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const crypto_1 = require("crypto");
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
function requireVerifiedAuth(request) {
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    if (request.auth.token.email_verified !== true) {
        throw new https_1.HttpsError("permission-denied", "Please verify your email address first.");
    }
    return request.auth.uid;
}
/** True when the user is an active Pro subscriber or manually exempted by an admin. */
async function isUserPro(uid) {
    var _a, _b, _c, _d, _e;
    try {
        const userRecord = await admin.auth().getUser(uid);
        const email = (_a = userRecord.email) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase();
        if (email) {
            const exemptSnap = await db().collection("exemptions").doc(email).get();
            if (exemptSnap.exists && ((_b = exemptSnap.data()) === null || _b === void 0 ? void 0 : _b.exempt) !== false)
                return true;
        }
    }
    catch (_f) {
        // fall through to subscription check
    }
    const userDoc = await db().collection("users").doc(uid).get();
    const data = userDoc.data() || {};
    if (data.plan !== "pro")
        return false;
    const status = data.subscriptionStatus;
    if (status !== "active" && status !== "on_trial" && status !== "on-trial")
        return false;
    const periodEnd = (_e = (_d = (_c = data.currentPeriodEnd) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c)) !== null && _e !== void 0 ? _e : null;
    return periodEnd === null || periodEnd > new Date();
}
async function requirePro(uid) {
    if (!(await isUserPro(uid))) {
        throw new https_1.HttpsError("permission-denied", "File sharing is available for Pro tier users only. Upgrade to Pro to share files.");
    }
}
function isNonEmptyString(v, max) {
    return typeof v === "string" && v.length > 0 && v.length <= max;
}
async function getUserSummary(uid) {
    try {
        const rec = await admin.auth().getUser(uid);
        return {
            uid: rec.uid,
            email: (rec.email || "").toLowerCase(),
            displayName: rec.displayName || (rec.email || "").split("@")[0] || "User",
        };
    }
    catch (_a) {
        return null;
    }
}
async function getPublicKeys(uids) {
    const result = {};
    if (uids.length === 0)
        return result;
    const refs = uids.map((u) => db().collection("sharingKeys").doc(u));
    const snaps = await db().getAll(...refs);
    snaps.forEach((s) => {
        var _a;
        const pk = (_a = s.data()) === null || _a === void 0 ? void 0 : _a.publicKeyJwk;
        if (s.exists && typeof pk === "string")
            result[s.id] = pk;
    });
    return result;
}
function bucket() {
    return admin.storage().bucket();
}
async function deleteShareObjects(files) {
    await Promise.all(files.map(async (f) => {
        if (!f.storagePath)
            return;
        try {
            await bucket().file(f.storagePath).delete({ ignoreNotFound: true });
        }
        catch (err) {
            console.warn(`Failed to delete shared object ${f.storagePath}:`, err);
        }
    }));
}
// ─── Sharing key pair (per user) ────────────────────────────────────────────
exports.getSharingKey = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    const snap = await db().collection("sharingKeys").doc(uid).get();
    if (!snap.exists)
        return { key: null };
    const data = snap.data() || {};
    return {
        key: {
            publicKeyJwk: data.publicKeyJwk,
            encryptedPrivateKey: data.encryptedPrivateKey,
        },
    };
});
exports.setSharingKey = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { publicKeyJwk, encryptedPrivateKey } = request.data || {};
    if (!isNonEmptyString(publicKeyJwk, 4000) || !isNonEmptyString(encryptedPrivateKey, 10000)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid sharing key payload.");
    }
    try {
        const jwk = JSON.parse(publicKeyJwk);
        if (jwk.kty !== "RSA" || typeof jwk.n !== "string" || typeof jwk.e !== "string" || jwk.d) {
            throw new Error("bad jwk");
        }
    }
    catch (_a) {
        throw new https_1.HttpsError("invalid-argument", "Invalid public key.");
    }
    try {
        // create() fails if a key already exists — keys are never silently replaced.
        await db().collection("sharingKeys").doc(uid).create({
            publicKeyJwk,
            encryptedPrivateKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { created: true };
    }
    catch (_b) {
        return { created: false };
    }
});
// ─── Recipient lookup (exact email match, Pro only) ─────────────────────────
// Velocity tracking per user to prevent email enumeration: max 30 lookups per minute
const lookupTimestamps = new Map();
function checkLookupRateLimit(uid) {
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
        throw new https_1.HttpsError("resource-exhausted", "Too many recipient lookups. Please wait a moment before trying again.");
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
exports.lookupShareRecipient = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c;
    const uid = requireVerifiedAuth(request);
    await requirePro(uid);
    checkLookupRateLimit(uid);
    const rawEmail = (_a = request.data) === null || _a === void 0 ? void 0 : _a.email;
    if (!isNonEmptyString(rawEmail, 320)) {
        throw new https_1.HttpsError("invalid-argument", "Enter a valid email address.");
    }
    const email = rawEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new https_1.HttpsError("invalid-argument", "Enter a valid email address.");
    }
    let rec;
    try {
        rec = await admin.auth().getUserByEmail(email);
    }
    catch (_d) {
        return { found: false };
    }
    if (rec.uid === uid) {
        throw new https_1.HttpsError("invalid-argument", "You cannot share files with yourself.");
    }
    const userDoc = await db().collection("users").doc(rec.uid).get();
    if (!userDoc.exists)
        return { found: false };
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
            publicKeyJwk: (_b = keys[rec.uid]) !== null && _b !== void 0 ? _b : null,
            favorite: ((_c = contactSnap.data()) === null || _c === void 0 ? void 0 : _c.favorite) === true,
        },
    };
});
// ─── Contacts: favorites, frequent recipients, custom groups ────────────────
exports.getShareContacts = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    const base = db().collection("shareContacts").doc(uid);
    const [contactsSnap, groupsSnap] = await Promise.all([
        base.collection("contacts").limit(300).get(),
        base.collection("groups").limit(100).get(),
    ]);
    const contactUids = contactsSnap.docs.map((d) => d.id);
    const keys = await getPublicKeys(contactUids);
    const contacts = contactsSnap.docs.map((d) => {
        var _a, _b, _c, _d;
        const c = d.data();
        return {
            uid: d.id,
            email: c.email || "",
            displayName: c.displayName || "",
            favorite: c.favorite === true,
            shareCount: typeof c.shareCount === "number" ? c.shareCount : 0,
            lastSharedAt: (_c = (_b = (_a = c.lastSharedAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : null,
            publicKeyJwk: (_d = keys[d.id]) !== null && _d !== void 0 ? _d : null,
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
async function upsertContacts(ownerUid, uids) {
    const summaries = await Promise.all(uids.map((u) => getUserSummary(u)));
    const valid = summaries.filter((s) => s !== null);
    const batch = db().batch();
    valid.forEach((s) => {
        const ref = db().collection("shareContacts").doc(ownerUid).collection("contacts").doc(s.uid);
        batch.set(ref, { email: s.email, displayName: s.displayName }, { merge: true });
    });
    await batch.commit();
    return valid;
}
exports.updateShareContact = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { recipientUid, favorite } = request.data || {};
    if (!isNonEmptyString(recipientUid, 128) || typeof favorite !== "boolean") {
        throw new https_1.HttpsError("invalid-argument", "Invalid contact update.");
    }
    if (recipientUid === uid)
        throw new https_1.HttpsError("invalid-argument", "Invalid recipient.");
    const valid = await upsertContacts(uid, [recipientUid]);
    if (valid.length === 0)
        throw new https_1.HttpsError("not-found", "Recipient not found.");
    await db()
        .collection("shareContacts").doc(uid)
        .collection("contacts").doc(recipientUid)
        .set({ favorite, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ok: true };
});
exports.saveShareGroup = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    await requirePro(uid);
    const { groupId, name, memberUids } = request.data || {};
    if (!isNonEmptyString(name, MAX_GROUP_NAME) || !name.trim()) {
        throw new https_1.HttpsError("invalid-argument", `Group name must be 1–${MAX_GROUP_NAME} characters.`);
    }
    if (!Array.isArray(memberUids) || memberUids.length === 0 || memberUids.length > MAX_RECIPIENTS) {
        throw new https_1.HttpsError("invalid-argument", `A group needs 1–${MAX_RECIPIENTS} members.`);
    }
    const unique = Array.from(new Set(memberUids.filter((m) => isNonEmptyString(m, 128) && m !== uid)));
    const valid = await upsertContacts(uid, unique);
    if (valid.length === 0)
        throw new https_1.HttpsError("invalid-argument", "No valid group members.");
    const groupsRef = db().collection("shareContacts").doc(uid).collection("groups");
    const id = isNonEmptyString(groupId, 128) ? groupId : groupsRef.doc().id;
    await groupsRef.doc(id).set({
        name: name.trim(),
        memberUids: valid.map((v) => v.uid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id };
});
exports.deleteShareGroup = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { groupId } = request.data || {};
    if (!isNonEmptyString(groupId, 128))
        throw new https_1.HttpsError("invalid-argument", "Invalid group.");
    await db().collection("shareContacts").doc(uid).collection("groups").doc(groupId).delete();
    return { ok: true };
});
exports.createShare = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    await requirePro(uid);
    const { shareId, itemType, encryptedName, files, recipientUids, wrappedKeys } = request.data || {};
    if (!isNonEmptyString(shareId, 64) || !/^[A-Za-z0-9-]{8,64}$/.test(shareId)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid share id.");
    }
    if (itemType !== "file" && itemType !== "folder") {
        throw new https_1.HttpsError("invalid-argument", "Invalid item type.");
    }
    if (!isNonEmptyString(encryptedName, 4000)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid item name.");
    }
    if (!Array.isArray(files) || files.length > MAX_FILES_PER_SHARE || (itemType === "file" && files.length !== 1)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid file list.");
    }
    const pathPrefix = `users/${uid}/shared/${shareId}/`;
    const cleanFiles = files.map((f) => {
        if (!isNonEmptyString(f === null || f === void 0 ? void 0 : f.storagePath, 512) ||
            !f.storagePath.startsWith(pathPrefix) ||
            f.storagePath.includes("..") ||
            !isNonEmptyString(f.encryptedName, 4000) ||
            !isNonEmptyString(f.encryptedType, 4000) ||
            !isNonEmptyString(f.encryptedPath, 8000) ||
            typeof f.size !== "number" || f.size < 0) {
            throw new https_1.HttpsError("invalid-argument", "Invalid file entry.");
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
        throw new https_1.HttpsError("invalid-argument", `Choose 1–${MAX_RECIPIENTS} recipients.`);
    }
    const recipients = Array.from(new Set(recipientUids));
    if (recipients.some((r) => !isNonEmptyString(r, 128) || r === uid)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid recipient list.");
    }
    if (!wrappedKeys || typeof wrappedKeys !== "object") {
        throw new https_1.HttpsError("invalid-argument", "Missing encryption keys.");
    }
    const cleanWrappedKeys = {};
    for (const holder of recipients) {
        const wk = wrappedKeys[holder];
        if (!isNonEmptyString(wk, 4000)) {
            throw new https_1.HttpsError("invalid-argument", "Missing encryption key for a recipient.");
        }
        cleanWrappedKeys[holder] = wk;
    }
    // Recipients must exist and have registered a sharing key.
    const keys = await getPublicKeys(recipients);
    const missing = recipients.filter((r) => !keys[r]);
    if (missing.length > 0) {
        throw new https_1.HttpsError("failed-precondition", "One or more recipients cannot receive shared files yet.");
    }
    // Ensure the sender actually uploaded every referenced object.
    const existence = await Promise.all(cleanFiles.map((f) => bucket().file(f.storagePath).exists()));
    if (existence.some(([exists]) => !exists)) {
        throw new https_1.HttpsError("failed-precondition", "Some shared files were not uploaded.");
    }
    const recipientSummaries = await Promise.all(recipients.map((r) => getUserSummary(r)));
    const validRecipients = recipientSummaries.filter((s) => s !== null);
    if (validRecipients.length !== recipients.length) {
        throw new https_1.HttpsError("not-found", "One or more recipients no longer exist.");
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
            await deleteShareObjects(cleanFiles).catch(() => { });
            throw new https_1.HttpsError("failed-precondition", `Recipient ${r.displayName || r.email} has insufficient storage space.`);
        }
    }
    const existingHead = await db().collection("shares").doc(shareId).get();
    if (existingHead.exists) {
        throw new https_1.HttpsError("already-exists", "This share already exists.");
    }
    // Create an independent Storage copy and Firestore share doc owned by each recipient.
    const createdDocIds = [];
    const createdCopies = [];
    try {
        for (let idx = 0; idx < validRecipients.length; idx++) {
            const r = validRecipients[idx];
            const copyShareId = idx === 0 ? shareId : (0, crypto_1.randomUUID)();
            const copiedFiles = [];
            for (const f of cleanFiles) {
                const destPath = `users/${r.uid}/shared/${copyShareId}/${(0, crypto_1.randomUUID)()}`;
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
    }
    catch (err) {
        await deleteShareObjects(createdCopies).catch(() => { });
        await Promise.all(createdDocIds.map((id) => db().collection("shares").doc(id).delete().catch(() => { })));
        throw err;
    }
    // Clean up temporary sender staging objects now that each recipient owns a copy.
    await deleteShareObjects(cleanFiles).catch((e) => console.warn("Failed to delete staging share files:", e));
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
            batch.set(db().collection("users").doc(r.uid), { storageUsed: admin.firestore.FieldValue.increment(shareSize) }, { merge: true });
        }
    });
    await batch.commit();
    return { ok: true, shareId };
});
async function getUserStorageUsageBytes(uid) {
    const [filesSnap, sharesSnap] = await Promise.all([
        db().collection("users").doc(uid).collection("files").get(),
        db().collection("shares").where("recipientUids", "array-contains", uid).get(),
    ]);
    const filesBytes = filesSnap.docs.reduce((sum, d) => sum + (Number(d.data().size) || 0), 0);
    const sharedBytes = sharesSnap.docs.reduce((sum, d) => {
        const files = d.data().files || [];
        return sum + files.reduce((fSum, f) => fSum + (Number(f.size) || 0), 0);
    }, 0);
    return filesBytes + sharedBytes;
}
/**
 * Ensures a share document is exclusively owned by `uid` as an independent copy.
 * Legacy single-recipient docs are promoted in-place; legacy multi-recipient docs
 * are forked into a dedicated document and isolated GCS objects for `uid`.
 */
async function ensureExclusiveRecipientShare(shareId, uid) {
    const ref = db().collection("shares").doc(shareId);
    const snap = await ref.get();
    if (!snap.exists) {
        throw new https_1.HttpsError("not-found", "Item not found.");
    }
    const s = snap.data() || {};
    const recipientUids = Array.isArray(s.recipientUids) ? s.recipientUids : [];
    const allowed = s.ownerUid === uid || recipientUids.includes(uid);
    if (!allowed) {
        throw new https_1.HttpsError("permission-denied", "You do not have access to this item.");
    }
    const existingFiles = Array.isArray(s.files) ? s.files : [];
    const pathMap = new Map(existingFiles.map((f) => [f.storagePath, f.storagePath]));
    if (s.ownerUid === uid && recipientUids.length === 1 && !s.senderUid) {
        return { ref, data: s, pathMap };
    }
    const wrappedKeyForUser = (s.wrappedKeys || {})[uid];
    if (recipientUids.length <= 1) {
        const migratedFiles = [];
        const oldSenderPathsToDelete = [];
        const newOwnerPrefix = `users/${uid}/shared/`;
        const copiedTemp = [];
        try {
            for (const f of existingFiles) {
                if (f.storagePath.startsWith(newOwnerPrefix)) {
                    migratedFiles.push(f);
                }
                else {
                    const destPath = `users/${uid}/shared/${shareId}/${(0, crypto_1.randomUUID)()}`;
                    await bucket().file(f.storagePath).copy(bucket().file(destPath));
                    copiedTemp.push({ storagePath: destPath });
                    pathMap.set(f.storagePath, destPath);
                    oldSenderPathsToDelete.push({ storagePath: f.storagePath });
                    migratedFiles.push({ ...f, storagePath: destPath });
                }
            }
        }
        catch (err) {
            await deleteShareObjects(copiedTemp).catch(() => { });
            throw err;
        }
        const updatedFields = {
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
            await deleteShareObjects(oldSenderPathsToDelete).catch(() => { });
        }
        return {
            ref,
            data: { ...s, ownerUid: uid, recipientUids: [uid], files: migratedFiles },
            pathMap,
        };
    }
    // Legacy multi-recipient share: fork an exclusive independent copy for uid
    const newShareId = (0, crypto_1.randomUUID)();
    const copiedFiles = [];
    const createdTemp = [];
    try {
        for (const f of existingFiles) {
            const destPath = `users/${uid}/shared/${newShareId}/${(0, crypto_1.randomUUID)()}`;
            await bucket().file(f.storagePath).copy(bucket().file(destPath));
            createdTemp.push({ storagePath: destPath });
            pathMap.set(f.storagePath, destPath);
            copiedFiles.push({ ...f, storagePath: destPath });
        }
    }
    catch (err) {
        await deleteShareObjects(createdTemp).catch(() => { });
        throw err;
    }
    const newRef = db().collection("shares").doc(newShareId);
    const newData = {
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
        recipients: (s.recipients || []).filter((r) => r.uid !== uid),
        [`wrappedKeys.${uid}`]: admin.firestore.FieldValue.delete(),
    });
    return { ref: newRef, data: newData, pathMap };
}
exports.listShares = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    const receivedSnap = await db()
        .collection("shares")
        .where("recipientUids", "array-contains", uid)
        .limit(500)
        .get();
    const toClient = (d) => {
        var _a, _b, _c, _d;
        const s = d.data();
        return {
            id: d.id,
            itemType: s.itemType,
            encryptedName: s.encryptedName,
            color: s.color || undefined,
            files: (s.files || []).map((f) => ({
                storagePath: f.storagePath,
                encryptedName: f.encryptedName,
                encryptedType: f.encryptedType,
                encryptedPath: f.encryptedPath,
                size: f.size,
            })),
            wrappedKey: (_a = (s.wrappedKeys || {})[uid]) !== null && _a !== void 0 ? _a : null,
            createdAt: (_d = (_c = (_b = s.createdAt) === null || _b === void 0 ? void 0 : _b.toMillis) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : Date.now(),
        };
    };
    return {
        received: receivedSnap.docs.map((d) => toClient(d)),
        sent: [],
    };
});
exports.getSharedFileUrl = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { shareId, storagePath } = request.data || {};
    if (!isNonEmptyString(shareId, 64) || !isNonEmptyString(storagePath, 512)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid request.");
    }
    const snap = await db().collection("shares").doc(shareId).get();
    if (!snap.exists)
        throw new https_1.HttpsError("not-found", "Item not found.");
    const s = snap.data() || {};
    const allowed = s.ownerUid === uid || (Array.isArray(s.recipientUids) && s.recipientUids.includes(uid));
    if (!allowed)
        throw new https_1.HttpsError("permission-denied", "You do not have access to this item.");
    if (!(s.files || []).some((f) => f.storagePath === storagePath)) {
        throw new https_1.HttpsError("not-found", "File not found.");
    }
    const file = bucket().file(storagePath);
    const [metadata] = await file.getMetadata();
    const custom = (metadata.metadata || {});
    let token = (custom.firebaseStorageDownloadTokens || "").split(",")[0];
    if (!token) {
        token = (0, crypto_1.randomUUID)();
        await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
    }
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket().name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
    return { url };
});
exports.updateShareItem = (0, https_1.onCall)(async (request) => {
    var _a;
    const uid = requireVerifiedAuth(request);
    const { shareId, encryptedName, color, updatedFiles } = request.data || {};
    if (!isNonEmptyString(shareId, 64)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid share id.");
    }
    const { ref, data, pathMap } = await ensureExclusiveRecipientShare(shareId, uid);
    const patch = {};
    if (encryptedName !== undefined) {
        if (!isNonEmptyString(encryptedName, 4000)) {
            throw new https_1.HttpsError("invalid-argument", "Invalid name.");
        }
        patch.encryptedName = encryptedName;
    }
    if (color !== undefined) {
        if (color !== null && (typeof color !== "string" || color.length > 32)) {
            throw new https_1.HttpsError("invalid-argument", "Invalid color.");
        }
        patch.color = color || null;
    }
    if (updatedFiles !== undefined) {
        if (!Array.isArray(updatedFiles) || updatedFiles.length > MAX_FILES_PER_SHARE) {
            throw new https_1.HttpsError("invalid-argument", "Invalid file updates.");
        }
        const updateByPath = new Map();
        for (const u of updatedFiles) {
            if (!u || !isNonEmptyString(u.storagePath, 512)) {
                throw new https_1.HttpsError("invalid-argument", "Invalid file update entry.");
            }
            const resolvedPath = (_a = pathMap.get(u.storagePath)) !== null && _a !== void 0 ? _a : u.storagePath;
            const entryUpdate = {};
            if (u.encryptedName !== undefined) {
                if (!isNonEmptyString(u.encryptedName, 4000)) {
                    throw new https_1.HttpsError("invalid-argument", "Invalid file name.");
                }
                entryUpdate.encryptedName = u.encryptedName;
            }
            if (u.encryptedPath !== undefined) {
                if (!isNonEmptyString(u.encryptedPath, 8000)) {
                    throw new https_1.HttpsError("invalid-argument", "Invalid file path.");
                }
                entryUpdate.encryptedPath = u.encryptedPath;
            }
            updateByPath.set(resolvedPath, entryUpdate);
        }
        const existingFiles = Array.isArray(data.files) ? data.files : [];
        patch.files = existingFiles.map((f) => {
            var _a, _b;
            const upd = updateByPath.get(f.storagePath);
            if (!upd)
                return f;
            return {
                ...f,
                encryptedName: (_a = upd.encryptedName) !== null && _a !== void 0 ? _a : f.encryptedName,
                encryptedPath: (_b = upd.encryptedPath) !== null && _b !== void 0 ? _b : f.encryptedPath,
            };
        });
    }
    if (Object.keys(patch).length > 0) {
        await ref.update(patch);
    }
    return { ok: true, shareId: ref.id };
});
exports.deleteSharedFiles = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { shareId, storagePaths } = request.data || {};
    if (!isNonEmptyString(shareId, 64)) {
        throw new https_1.HttpsError("invalid-argument", "Invalid share id.");
    }
    if (!Array.isArray(storagePaths) || storagePaths.length === 0 || storagePaths.length > MAX_FILES_PER_SHARE) {
        throw new https_1.HttpsError("invalid-argument", "Invalid files list.");
    }
    const { ref, data, pathMap } = await ensureExclusiveRecipientShare(shareId, uid);
    const targetPaths = new Set(storagePaths
        .filter((p) => isNonEmptyString(p, 512))
        .map((p) => { var _a; return (_a = pathMap.get(p)) !== null && _a !== void 0 ? _a : p; }));
    const existingFiles = Array.isArray(data.files) ? data.files : [];
    const toDelete = existingFiles.filter((f) => targetPaths.has(f.storagePath));
    const remaining = existingFiles.filter((f) => !targetPaths.has(f.storagePath));
    if (toDelete.length === 0) {
        return { ok: true, shareId: ref.id, remainingCount: existingFiles.length };
    }
    const freedSize = toDelete.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
    await deleteShareObjects(toDelete);
    if (remaining.length === 0 && data.itemType !== "folder") {
        await ref.delete();
    }
    else {
        await ref.update({ files: remaining });
    }
    if (freedSize > 0) {
        await db().collection("users").doc(uid).set({ storageUsed: admin.firestore.FieldValue.increment(-freedSize) }, { merge: true }).catch((e) => console.warn("Failed to decrement storage for recipient:", e));
    }
    return { ok: true, shareId: ref.id, remainingCount: remaining.length };
});
exports.deleteShare = (0, https_1.onCall)(async (request) => {
    const uid = requireVerifiedAuth(request);
    const { shareId } = request.data || {};
    if (!isNonEmptyString(shareId, 64))
        throw new https_1.HttpsError("invalid-argument", "Invalid share id.");
    const ref = db().collection("shares").doc(shareId);
    const snap = await ref.get();
    if (!snap.exists)
        return { ok: true };
    const s = snap.data() || {};
    const recipientUids = Array.isArray(s.recipientUids) ? s.recipientUids : [];
    const shareSize = (s.files || []).reduce((sum, f) => sum + (Number(f.size) || 0), 0);
    const isOwner = s.ownerUid === uid || recipientUids.includes(uid);
    if (!isOwner) {
        throw new https_1.HttpsError("permission-denied", "You do not have access to this item.");
    }
    const remaining = recipientUids.filter((r) => r !== uid);
    if (remaining.length === 0) {
        await deleteShareObjects(s.files || []);
        await ref.delete();
    }
    else {
        await ref.update({
            recipientUids: remaining,
            recipients: (s.recipients || []).filter((r) => r.uid !== uid),
            [`wrappedKeys.${uid}`]: admin.firestore.FieldValue.delete(),
        });
    }
    if (shareSize > 0) {
        await db().collection("users").doc(uid).set({ storageUsed: admin.firestore.FieldValue.increment(-shareSize) }, { merge: true }).catch((e) => console.warn("Failed to decrement storage for user:", e));
    }
    return { ok: true, revoked: false };
});
//# sourceMappingURL=sharing.js.map