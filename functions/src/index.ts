import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
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
