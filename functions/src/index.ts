import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as crypto from "crypto";
import { validatePlatformInput } from "./validatePlatform";

admin.initializeApp();
const db = admin.firestore();

const PLATFORMS_COLLECTION = "platforms";

// ─── Helper: check admin claim ───────────────────────────────────────────────
function assertAdmin(auth: { uid: string; token: admin.auth.DecodedIdToken } | undefined): void {
    if (!auth) {
        throw new HttpsError("unauthenticated", "You must be signed in.");
    }
    if (!auth.token.admin) {
        throw new HttpsError("permission-denied", "Admin privileges required.");
    }
}

// ─── addPlatform ─────────────────────────────────────────────────────────────
export const addPlatform = onCall(async (request) => {
    assertAdmin(request.auth);
    const input = validatePlatformInput(request.data);

    const docRef = await db.collection(PLATFORMS_COLLECTION).add({
        name: input.name,
        domain: input.domain,
        color: input.color,
        category: input.category,
        logoUrl: input.logoUrl,
        link: input.link,
    });

    return { id: docRef.id };
});

// ─── updatePlatform ──────────────────────────────────────────────────────────
export const updatePlatform = onCall(async (request) => {
    assertAdmin(request.auth);

    const id = request.data?.id;
    if (!id || typeof id !== "string") {
        throw new HttpsError("invalid-argument", "Platform ID is required.");
    }

    const input = validatePlatformInput(request.data);
    const docRef = db.collection(PLATFORMS_COLLECTION).doc(id);

    const existing = await docRef.get();
    if (!existing.exists) {
        throw new HttpsError("not-found", "Platform not found.");
    }

    await docRef.update({
        name: input.name,
        domain: input.domain,
        color: input.color,
        category: input.category,
        logoUrl: input.logoUrl,
        link: input.link,
    });

    return { success: true };
});

// ─── deletePlatform ──────────────────────────────────────────────────────────
export const deletePlatform = onCall(async (request) => {
    assertAdmin(request.auth);

    const id = request.data?.id;
    if (!id || typeof id !== "string") {
        throw new HttpsError("invalid-argument", "Platform ID is required.");
    }

    const docRef = db.collection(PLATFORMS_COLLECTION).doc(id);
    const existing = await docRef.get();
    if (!existing.exists) {
        throw new HttpsError("not-found", "Platform not found.");
    }

    await docRef.delete();
    return { success: true };
});

// ─── setAdminClaim ───────────────────────────────────────────────────────────
// One-time setup function. Grant admin privileges to the hard-coded UID.
// This can be called once and then removed or left disabled.
export const setAdminClaim = onCall(async (request) => {
    // Only allow the specific admin UID to bootstrap themselves
    const ADMIN_UID = "NGq845EEJEMDZKKAPZMaSxznt5p2";

    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    if (request.auth.uid !== ADMIN_UID) {
        throw new HttpsError("permission-denied", "Not authorised to set admin claims.");
    }

    await admin.auth().setCustomUserClaims(ADMIN_UID, { admin: true });
    return { success: true, message: "Admin claim set. Sign out and back in for it to take effect." };
});

// ─── Key Escrow Crypto Utilities ─────────────────────────────────────────────
const ESCROW_SECRET = process.env.ESCROW_SECRET || "default_escrow_secret_key_123456";
// Ensure exactly 32 bytes for AES-256
const ESCROW_KEY = crypto.createHash("sha256").update(ESCROW_SECRET).digest();

function encryptForEscrow(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", ESCROW_KEY, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${encrypted}:${authTag}`;
}

function decryptFromEscrow(encryptedText: string): string {
    const [ivHex, cipherHex, authTagHex] = encryptedText.split(":");
    const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        ESCROW_KEY,
        Buffer.from(ivHex, "hex")
    );
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

// ─── escrowMasterKey ─────────────────────────────────────────────────────────
export const escrowMasterKey = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    const masterKeyHex = request.data?.masterKey;
    if (typeof masterKeyHex !== "string" || !masterKeyHex) {
        throw new HttpsError("invalid-argument", "Missing masterKey");
    }

    const escrowed = encryptForEscrow(masterKeyHex);
    await db.collection("users").doc(request.auth.uid).update({
        escrowedMasterKey: escrowed
    });

    return { success: true };
});

// ─── recoverMasterKey ─────────────────────────────────────────────────────────────────────────
// Also returns the user's salt so the client can re-derive the PDK without
// a separate Firestore read (which may be blocked by network/ad filters).
export const recoverMasterKey = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");
    
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found.");
    
    const escrowed = userDoc.data()?.escrowedMasterKey;
    if (!escrowed) throw new HttpsError("failed-precondition", "No escrowed key found.");

    try {
        const masterKey = decryptFromEscrow(escrowed);
        // Return the salt alongside the master key so the caller can derive
        // a new PDK entirely client-side without an extra Firestore read.
        return { masterKey, salt: userDoc.data()?.salt ?? null };
    } catch (e) {
        throw new HttpsError("internal", "Failed to decrypt escrowed key.");
    }
});

// ─── saveEncryptedMasterKey ─────────────────────────────────────────────────────────────────
// Persists a freshly re-encrypted master key back to Firestore via admin SDK,
// bypassing any client-side network filters that block googleapis.com writes.
export const saveEncryptedMasterKey = onCall(async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const encryptedMasterKey = request.data?.encryptedMasterKey;
    if (typeof encryptedMasterKey !== "string" || !encryptedMasterKey) {
        throw new HttpsError("invalid-argument", "Missing encryptedMasterKey.");
    }

    await db.collection("users").doc(request.auth.uid).update({ encryptedMasterKey });
    return { success: true };
});
