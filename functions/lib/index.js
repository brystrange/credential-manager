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
exports.saveEncryptedMasterKey = exports.recoverMasterKey = exports.escrowMasterKey = exports.setAdminClaim = exports.deletePlatform = exports.updatePlatform = exports.addPlatform = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const crypto = __importStar(require("crypto"));
const validatePlatform_1 = require("./validatePlatform");
admin.initializeApp();
const db = admin.firestore();
const PLATFORMS_COLLECTION = "platforms";
// ─── Helper: check admin claim ───────────────────────────────────────────────
function assertAdmin(auth) {
    if (!auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in.");
    }
    if (!auth.token.admin) {
        throw new https_1.HttpsError("permission-denied", "Admin privileges required.");
    }
}
// ─── addPlatform ─────────────────────────────────────────────────────────────
exports.addPlatform = (0, https_1.onCall)(async (request) => {
    assertAdmin(request.auth);
    const input = (0, validatePlatform_1.validatePlatformInput)(request.data);
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
exports.updatePlatform = (0, https_1.onCall)(async (request) => {
    var _a;
    assertAdmin(request.auth);
    const id = (_a = request.data) === null || _a === void 0 ? void 0 : _a.id;
    if (!id || typeof id !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Platform ID is required.");
    }
    const input = (0, validatePlatform_1.validatePlatformInput)(request.data);
    const docRef = db.collection(PLATFORMS_COLLECTION).doc(id);
    const existing = await docRef.get();
    if (!existing.exists) {
        throw new https_1.HttpsError("not-found", "Platform not found.");
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
exports.deletePlatform = (0, https_1.onCall)(async (request) => {
    var _a;
    assertAdmin(request.auth);
    const id = (_a = request.data) === null || _a === void 0 ? void 0 : _a.id;
    if (!id || typeof id !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Platform ID is required.");
    }
    const docRef = db.collection(PLATFORMS_COLLECTION).doc(id);
    const existing = await docRef.get();
    if (!existing.exists) {
        throw new https_1.HttpsError("not-found", "Platform not found.");
    }
    await docRef.delete();
    return { success: true };
});
// ─── setAdminClaim ───────────────────────────────────────────────────────────
// One-time setup function. Grant admin privileges to the hard-coded UID.
// This can be called once and then removed or left disabled.
exports.setAdminClaim = (0, https_1.onCall)(async (request) => {
    // Only allow the specific admin UID to bootstrap themselves
    const ADMIN_UID = "NGq845EEJEMDZKKAPZMaSxznt5p2";
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in.");
    }
    if (request.auth.uid !== ADMIN_UID) {
        throw new https_1.HttpsError("permission-denied", "Not authorised to set admin claims.");
    }
    await admin.auth().setCustomUserClaims(ADMIN_UID, { admin: true });
    return { success: true, message: "Admin claim set. Sign out and back in for it to take effect." };
});
// ─── Key Escrow Crypto Utilities ─────────────────────────────────────────────
const ESCROW_SECRET = process.env.ESCROW_SECRET || "default_escrow_secret_key_123456";
// Ensure exactly 32 bytes for AES-256
const ESCROW_KEY = crypto.createHash("sha256").update(ESCROW_SECRET).digest();
function encryptForEscrow(text) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", ESCROW_KEY, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");
    return `${iv.toString("hex")}:${encrypted}:${authTag}`;
}
function decryptFromEscrow(encryptedText) {
    const [ivHex, cipherHex, authTagHex] = encryptedText.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ESCROW_KEY, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}
// ─── escrowMasterKey ─────────────────────────────────────────────────────────
exports.escrowMasterKey = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    const masterKeyHex = (_a = request.data) === null || _a === void 0 ? void 0 : _a.masterKey;
    if (typeof masterKeyHex !== "string" || !masterKeyHex) {
        throw new https_1.HttpsError("invalid-argument", "Missing masterKey");
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
exports.recoverMasterKey = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    const userDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!userDoc.exists)
        throw new https_1.HttpsError("not-found", "User not found.");
    const escrowed = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.escrowedMasterKey;
    if (!escrowed)
        throw new https_1.HttpsError("failed-precondition", "No escrowed key found.");
    try {
        const masterKey = decryptFromEscrow(escrowed);
        // Return the salt alongside the master key so the caller can derive
        // a new PDK entirely client-side without an extra Firestore read.
        return { masterKey, salt: (_c = (_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.salt) !== null && _c !== void 0 ? _c : null };
    }
    catch (e) {
        throw new https_1.HttpsError("internal", "Failed to decrypt escrowed key.");
    }
});
// ─── saveEncryptedMasterKey ─────────────────────────────────────────────────────────────────
// Persists a freshly re-encrypted master key back to Firestore via admin SDK,
// bypassing any client-side network filters that block googleapis.com writes.
exports.saveEncryptedMasterKey = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    const encryptedMasterKey = (_a = request.data) === null || _a === void 0 ? void 0 : _a.encryptedMasterKey;
    if (typeof encryptedMasterKey !== "string" || !encryptedMasterKey) {
        throw new https_1.HttpsError("invalid-argument", "Missing encryptedMasterKey.");
    }
    await db.collection("users").doc(request.auth.uid).update({ encryptedMasterKey });
    return { success: true };
});
//# sourceMappingURL=index.js.map