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
exports.getPendingCustomPlatforms = exports.createBillingPortalSession = exports.lemonWebhook = exports.createCheckoutSession = exports.setAdminClaim = exports.deletePlatform = exports.updatePlatform = exports.addPlatform = void 0;
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
// One-time setup function. Grant admin privileges to the hard-coded email.
// This can be called once and then removed or left disabled.
exports.setAdminClaim = (0, https_1.onCall)(async (request) => {
    // Only allow the specific admin email to bootstrap themselves
    const ADMIN_EMAIL = "bryankeithmayor1@gmail.com";
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be signed in.");
    }
    if (request.auth.token.email !== ADMIN_EMAIL) {
        throw new https_1.HttpsError("permission-denied", "Not authorised to set admin claims.");
    }
    await admin.auth().setCustomUserClaims(request.auth.uid, { admin: true });
    return { success: true, message: "Admin claim set. Sign out and back in for it to take effect." };
});
// Removed escrow functionality for true zero-knowledge security.
// ══════════════════════════════════════════════════════════════════════════════
//  LEMON SQUEEZY SUBSCRIPTION INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════
const https_2 = require("firebase-functions/v2/https");
const https = __importStar(require("https"));
/** Helper: POST to Lemon Squeezy REST API */
function lsRequest(path, method, apiKey, body) {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const req = https.request({
            hostname: "api.lemonsqueezy.com",
            path,
            method,
            headers: {
                "Accept": "application/vnd.api+json",
                "Content-Type": "application/vnd.api+json",
                "Authorization": `Bearer ${apiKey}`,
                ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
            },
        }, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch (_a) {
                    reject(new Error(`Invalid JSON from Lemon Squeezy: ${data}`));
                }
            });
        });
        req.on("error", reject);
        if (payload)
            req.write(payload);
        req.end();
    });
}
// ─── createCheckoutSession ───────────────────────────────────────────────────
// Called from the frontend when a user clicks "Upgrade".
// Creates a Lemon Squeezy hosted checkout session and returns its URL.
exports.createCheckoutSession = (0, https_1.onCall)({ secrets: ["LEMONSQUEEZY_API_KEY", "LEMONSQUEEZY_STORE_ID"] }, async (request) => {
    var _a, _b, _c, _d;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    const variantId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.variantId;
    if (!variantId || typeof variantId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "variantId is required.");
    }
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!apiKey || !storeId) {
        throw new https_1.HttpsError("failed-precondition", "Lemon Squeezy not configured.");
    }
    // Fetch user email for pre-filling the checkout form
    const userRecord = await admin.auth().getUser(request.auth.uid);
    const response = await lsRequest("/v1/checkouts", "POST", apiKey, {
        data: {
            type: "checkouts",
            attributes: {
                checkout_data: {
                    email: (_b = userRecord.email) !== null && _b !== void 0 ? _b : undefined,
                    custom: {
                        user_id: request.auth.uid,
                    },
                },
            },
            relationships: {
                store: { data: { type: "stores", id: storeId } },
                variant: { data: { type: "variants", id: variantId } },
            },
        },
    });
    const checkoutUrl = (_d = (_c = response.data) === null || _c === void 0 ? void 0 : _c.attributes) === null || _d === void 0 ? void 0 : _d.url;
    if (!checkoutUrl) {
        console.error("Lemon Squeezy checkout error:", JSON.stringify(response));
        throw new https_1.HttpsError("internal", "Failed to create checkout session.");
    }
    return { checkoutUrl };
});
// ─── lemonWebhook ────────────────────────────────────────────────────────────
// Public HTTPS endpoint for Lemon Squeezy to POST events to.
// Verifies HMAC-SHA256 signature before processing.
exports.lemonWebhook = (0, https_2.onRequest)({ secrets: ["LEMONSQUEEZY_WEBHOOK_SECRET"] }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    if (!secret) {
        console.error("LEMONSQUEEZY_WEBHOOK_SECRET not set");
        res.status(500).send("Server misconfiguration");
        return;
    }
    // Verify HMAC-SHA256 signature
    const signature = req.headers["x-signature"];
    if (!signature) {
        res.status(401).send("Missing signature");
        return;
    }
    // req.rawBody is available in Firebase Functions v2
    const rawBody = req.rawBody;
    if (!rawBody) {
        res.status(400).send("No raw body");
        return;
    }
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(rawBody);
    const digest = hmac.digest("hex");
    if (!crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(signature, "hex"))) {
        res.status(403).send("Invalid signature");
        return;
    }
    // Parse payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = JSON.parse(rawBody.toString("utf8"));
    const eventName = (_b = (_a = payload.meta) === null || _a === void 0 ? void 0 : _a.event_name) !== null && _b !== void 0 ? _b : "";
    const uid = (_d = (_c = payload.meta) === null || _c === void 0 ? void 0 : _c.custom_data) === null || _d === void 0 ? void 0 : _d.user_id;
    const attributes = (_f = (_e = payload.data) === null || _e === void 0 ? void 0 : _e.attributes) !== null && _f !== void 0 ? _f : {};
    if (!uid) {
        // Cannot associate event with a user — acknowledge and move on
        res.status(200).send("ok");
        return;
    }
    const userRef = db.collection("users").doc(uid);
    try {
        switch (eventName) {
            case "subscription_created":
            case "subscription_resumed":
                await userRef.update({
                    plan: "pro",
                    subscriptionId: String((_h = (_g = payload.data) === null || _g === void 0 ? void 0 : _g.id) !== null && _h !== void 0 ? _h : ""),
                    subscriptionStatus: "active",
                    currentPeriodEnd: attributes.renews_at
                        ? admin.firestore.Timestamp.fromDate(new Date(attributes.renews_at))
                        : null,
                    lsCustomerId: String((_j = attributes.customer_id) !== null && _j !== void 0 ? _j : ""),
                });
                break;
            case "subscription_updated":
                await userRef.update({
                    subscriptionStatus: (_k = attributes.status) !== null && _k !== void 0 ? _k : "active",
                    currentPeriodEnd: attributes.renews_at
                        ? admin.firestore.Timestamp.fromDate(new Date(attributes.renews_at))
                        : null,
                });
                break;
            case "subscription_cancelled":
                await userRef.update({
                    subscriptionStatus: "cancelled",
                    // Keep plan: "pro" — user retains access until period ends
                });
                break;
            case "subscription_expired":
                await userRef.update({
                    plan: "free",
                    subscriptionStatus: "expired",
                });
                break;
            default:
                console.log(`Unhandled Lemon Squeezy event: ${eventName}`);
        }
    }
    catch (err) {
        console.error(`Failed to process ${eventName} for uid ${uid}:`, err);
    }
    // Always respond 200 so Lemon Squeezy doesn't retry unnecessarily
    res.status(200).send("ok");
});
// ─── createBillingPortalSession ──────────────────────────────────────────────
// Returns the Lemon Squeezy customer portal URL for a given subscription.
exports.createBillingPortalSession = (0, https_1.onCall)({ secrets: ["LEMONSQUEEZY_API_KEY"] }, async (request) => {
    var _a, _b, _c, _d;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    const subscriptionId = (_a = request.data) === null || _a === void 0 ? void 0 : _a.subscriptionId;
    if (!subscriptionId || typeof subscriptionId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "subscriptionId is required.");
    }
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "Lemon Squeezy not configured.");
    }
    const response = await lsRequest(`/v1/subscriptions/${subscriptionId}`, "GET", apiKey);
    const portalUrl = (_d = (_c = (_b = response.data) === null || _b === void 0 ? void 0 : _b.attributes) === null || _c === void 0 ? void 0 : _c.urls) === null || _d === void 0 ? void 0 : _d.customer_portal;
    if (!portalUrl) {
        throw new https_1.HttpsError("not-found", "Could not retrieve billing portal URL.");
    }
    return { portalUrl };
});
// ─── getPendingCustomPlatforms ──────────────────────────────────────────────
exports.getPendingCustomPlatforms = (0, https_1.onCall)({ timeoutSeconds: 300 }, async (request) => {
    assertAdmin(request.auth);
    // 1. Fetch all existing global platforms
    const platformsSnap = await db.collection(PLATFORMS_COLLECTION).get();
    const globalPlatformNames = new Set();
    platformsSnap.forEach((doc) => {
        globalPlatformNames.add(doc.data().name.toLowerCase());
    });
    // 2. Fetch all credentials across all users using a collectionGroup query
    const credentialsSnap = await db.collectionGroup("credentials").get();
    const pendingMap = new Map();
    credentialsSnap.forEach((doc) => {
        const platform = doc.data().platform;
        if (platform && typeof platform === "string") {
            const platformName = platform.trim();
            if (platformName && !globalPlatformNames.has(platformName.toLowerCase())) {
                const count = pendingMap.get(platformName) || 0;
                pendingMap.set(platformName, count + 1);
            }
        }
    });
    // 3. Convert to array and sort by count descending
    const pendingPlatforms = Array.from(pendingMap.entries()).map(([name, count]) => ({
        name,
        count
    }));
    pendingPlatforms.sort((a, b) => b.count - a.count);
    return { pendingPlatforms };
});
//# sourceMappingURL=index.js.map