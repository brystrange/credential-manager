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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoDeleteExcessData = exports.exchangeGoogleAuthCode = exports.googleAuthCallback = exports.googleAuthStart = exports.getPendingCustomPlatforms = exports.createBillingPortalSession = exports.syncSubscriptionStatus = exports.lemonWebhook = exports.createCheckoutSession = exports.setAdminClaim = exports.deletePlatform = exports.updatePlatform = exports.addPlatform = void 0;
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
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
    var _a, _b;
    assertAdmin(request.auth);
    const uid = (_a = request.data) === null || _a === void 0 ? void 0 : _a.uid;
    const revoke = ((_b = request.data) === null || _b === void 0 ? void 0 : _b.revoke) === true;
    if (!uid || typeof uid !== "string") {
        throw new https_1.HttpsError("invalid-argument", "Target UID is required.");
    }
    await admin.auth().setCustomUserClaims(uid, revoke ? { admin: false } : { admin: true });
    return { success: true, message: `Admin claim ${revoke ? 'revoked from' : 'granted to'} user ${uid}.` };
});
// Removed escrow functionality for true zero-knowledge security.
// ══════════════════════════════════════════════════════════════════════════════
//  LEMON SQUEEZY SUBSCRIPTION INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════
const https = __importStar(require("https"));
const FREE_CREDENTIAL_LIMIT = 10;
const FREE_STORAGE_LIMIT = 500 * 1024 * 1024; // 500 MB
/** Helper: check if a user is manually exempted by an admin (grants Pro tier limits) */
async function isUserExempt(uid) {
    var _a, _b;
    try {
        const userRecord = await admin.auth().getUser(uid);
        const email = (_a = userRecord.email) === null || _a === void 0 ? void 0 : _a.trim().toLowerCase();
        if (!email)
            return false;
        const exemptSnap = await db.collection("exemptions").doc(email).get();
        return exemptSnap.exists && ((_b = exemptSnap.data()) === null || _b === void 0 ? void 0 : _b.exempt) !== false;
    }
    catch (_c) {
        return false;
    }
}
/** Helper: sync custom claim plan for Storage security rules */
async function syncUserPlanClaim(uid, plan) {
    try {
        const user = await admin.auth().getUser(uid);
        const existingClaims = user.customClaims || {};
        if (plan === "pro") {
            if (existingClaims.plan !== "pro") {
                await admin.auth().setCustomUserClaims(uid, { ...existingClaims, plan: "pro" });
            }
        }
        else {
            if (existingClaims.plan) {
                const newClaims = { ...existingClaims };
                delete newClaims.plan;
                await admin.auth().setCustomUserClaims(uid, newClaims);
            }
        }
    }
    catch (err) {
        console.warn(`Failed to sync custom claim for user ${uid}:`, err);
    }
}
/** Helper: compute user's current credential count and file storage usage */
async function checkUserUsageAndGracePeriod(userRef, fallbackStorageUsed = 0) {
    const [credsSnap, filesSnap, sharesSnap] = await Promise.all([
        userRef.collection("credentials").count().get(),
        userRef.collection("files").get(),
        admin.firestore().collection("shares").where("recipientUids", "array-contains", userRef.id).get(),
    ]);
    const credsCount = credsSnap.data().count;
    const filesBytes = filesSnap.docs.reduce((sum, d) => sum + (Number(d.data().size) || 0), 0);
    const sharedBytes = sharesSnap.docs.reduce((sum, d) => {
        const files = d.data().files || [];
        return sum + files.reduce((fSum, f) => fSum + (Number(f.size) || 0), 0);
    }, 0);
    const calculatedStorageUsed = filesBytes + sharedBytes;
    const storageUsed = (filesSnap.empty && sharesSnap.empty)
        ? Math.min(Math.max(0, fallbackStorageUsed), 0)
        : calculatedStorageUsed;
    if (storageUsed !== fallbackStorageUsed) {
        await userRef.update({ storageUsed }).catch(() => { });
    }
    const isExempt = await isUserExempt(userRef.id);
    const exceedsFreeLimit = !isExempt && (credsCount > FREE_CREDENTIAL_LIMIT || storageUsed > FREE_STORAGE_LIMIT);
    let gracePeriodEnd = null;
    if (exceedsFreeLimit) {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        gracePeriodEnd = admin.firestore.Timestamp.fromDate(d);
    }
    return { credsCount, storageUsed, exceedsFreeLimit, gracePeriodEnd };
}
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
                "Authorization": `Bearer ${apiKey.trim()}`,
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
const checkoutTimestamps = new Map();
function checkCheckoutRateLimit(uid) {
    const now = Date.now();
    const windowMs = 60 * 1000;
    const maxRequests = 5;
    let list = checkoutTimestamps.get(uid) || [];
    list = list.filter((t) => now - t < windowMs);
    checkoutTimestamps.set(uid, list);
    if (list.length >= maxRequests) {
        throw new https_1.HttpsError("resource-exhausted", "Too many checkout requests. Please wait a minute before trying again.");
    }
    list.push(now);
}
exports.createCheckoutSession = (0, https_1.onCall)({ secrets: ["LEMONSQUEEZY_API_KEY", "LEMONSQUEEZY_STORE_ID"] }, async (request) => {
    var _a, _b, _c, _d;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    checkCheckoutRateLimit(request.auth.uid);
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
                custom_price: 150, // $1.50/month in cents
                checkout_data: {
                    email: (_b = userRecord.email) !== null && _b !== void 0 ? _b : undefined,
                    custom: {
                        user_id: request.auth.uid,
                    },
                },
            },
            relationships: {
                store: {
                    data: {
                        type: "stores",
                        id: storeId.toString().trim(),
                    },
                },
                variant: {
                    data: {
                        type: "variants",
                        id: variantId.toString().trim(),
                    },
                },
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
exports.lemonWebhook = (0, https_1.onRequest)({ secrets: ["LEMONSQUEEZY_WEBHOOK_SECRET"] }, async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }
    const secret = (_a = process.env.LEMONSQUEEZY_WEBHOOK_SECRET) === null || _a === void 0 ? void 0 : _a.trim();
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
    let isSigValid = false;
    try {
        const digestBuf = Buffer.from(digest, "utf8");
        const sigBuf = Buffer.from(signature, "utf8");
        if (digestBuf.length === sigBuf.length && crypto.timingSafeEqual(digestBuf, sigBuf)) {
            isSigValid = true;
        }
    }
    catch (_t) {
        isSigValid = false;
    }
    if (!isSigValid) {
        res.status(403).send("Invalid signature");
        return;
    }
    // Parse payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload = JSON.parse(rawBody.toString("utf8"));
    const eventName = (_c = (_b = payload.meta) === null || _b === void 0 ? void 0 : _b.event_name) !== null && _c !== void 0 ? _c : "";
    let uid = (_e = (_d = payload.meta) === null || _d === void 0 ? void 0 : _d.custom_data) === null || _e === void 0 ? void 0 : _e.user_id;
    // Replay attack and idempotency protection
    const eventId = ((_f = payload.meta) === null || _f === void 0 ? void 0 : _f.event_id) || ((_g = payload.meta) === null || _g === void 0 ? void 0 : _g.webhook_id) || `${eventName}_${(_h = payload.data) === null || _h === void 0 ? void 0 : _h.id}_${((_j = payload.meta) === null || _j === void 0 ? void 0 : _j.created_at) || Date.now()}`;
    const eventRef = db.collection("processedWebhooks").doc(String(eventId));
    const eventDoc = await eventRef.get();
    if (eventDoc.exists) {
        console.log(`Webhook event ${eventId} already processed, skipping duplicate.`);
        res.status(200).json({ received: true, duplicate: true });
        return;
    }
    await eventRef.set({
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
        eventName,
        uid: uid || null,
    });
    const attributes = (_l = (_k = payload.data) === null || _k === void 0 ? void 0 : _k.attributes) !== null && _l !== void 0 ? _l : {};
    const subId = ((_m = payload.data) === null || _m === void 0 ? void 0 : _m.id) ? String(payload.data.id) : "";
    const customerId = attributes.customer_id ? String(attributes.customer_id) : "";
    const userEmail = attributes.user_email;
    if (!uid && subId) {
        const snap = await db.collection("users").where("subscriptionId", "==", subId).limit(1).get();
        if (!snap.empty)
            uid = snap.docs[0].id;
    }
    if (!uid && customerId) {
        const snap = await db.collection("users").where("lsCustomerId", "==", customerId).limit(1).get();
        if (!snap.empty)
            uid = snap.docs[0].id;
    }
    if (!uid && userEmail) {
        try {
            const userRecord = await admin.auth().getUserByEmail(userEmail);
            uid = userRecord.uid;
        }
        catch (_u) {
            // Ignore if user email is not found in Firebase Auth
        }
    }
    if (!uid) {
        // Cannot associate event with a user — acknowledge and move on
        res.status(200).send("ok");
        return;
    }
    const userRef = db.collection("users").doc(uid);
    const periodEndIso = attributes.renews_at || attributes.trial_ends_at || attributes.ends_at;
    try {
        if (await isUserExempt(uid)) {
            await userRef.update({
                plan: "pro",
                subscriptionStatus: "active",
                downgradeGracePeriodEnd: admin.firestore.FieldValue.delete(),
            });
            await syncUserPlanClaim(uid, "pro");
            res.status(200).send("ok");
            return;
        }
        switch (eventName) {
            case "subscription_created":
            case "subscription_resumed":
                await userRef.update({
                    plan: "pro",
                    subscriptionId: subId,
                    subscriptionStatus: attributes.status === "on_trial" ? "active" : ((_o = attributes.status) !== null && _o !== void 0 ? _o : "active"),
                    currentPeriodEnd: periodEndIso
                        ? admin.firestore.Timestamp.fromDate(new Date(periodEndIso))
                        : null,
                    lsCustomerId: customerId,
                    downgradeGracePeriodEnd: admin.firestore.FieldValue.delete(),
                });
                await syncUserPlanClaim(uid, "pro");
                break;
            case "subscription_updated": {
                const isCancelledOrExpired = attributes.cancelled === true ||
                    attributes.status === "cancelled" ||
                    attributes.status === "expired";
                if (isCancelledOrExpired) {
                    const userDoc = await userRef.get();
                    const usage = await checkUserUsageAndGracePeriod(userRef, ((_p = userDoc.data()) === null || _p === void 0 ? void 0 : _p.storageUsed) || 0);
                    await userRef.update({
                        plan: "free",
                        subscriptionStatus: attributes.status === "expired" ? "expired" : "cancelled",
                        currentPeriodEnd: null,
                        downgradeGracePeriodEnd: usage.gracePeriodEnd
                            ? usage.gracePeriodEnd
                            : admin.firestore.FieldValue.delete(),
                    });
                }
                else {
                    await userRef.update({
                        plan: "pro",
                        subscriptionStatus: attributes.status === "on_trial" ? "active" : ((_q = attributes.status) !== null && _q !== void 0 ? _q : "active"),
                        currentPeriodEnd: periodEndIso
                            ? admin.firestore.Timestamp.fromDate(new Date(periodEndIso))
                            : null,
                    });
                }
                break;
            }
            case "subscription_cancelled": {
                const userDoc = await userRef.get();
                const usage = await checkUserUsageAndGracePeriod(userRef, ((_r = userDoc.data()) === null || _r === void 0 ? void 0 : _r.storageUsed) || 0);
                await userRef.update({
                    plan: "free",
                    subscriptionStatus: "cancelled",
                    currentPeriodEnd: null,
                    downgradeGracePeriodEnd: usage.gracePeriodEnd
                        ? usage.gracePeriodEnd
                        : admin.firestore.FieldValue.delete(),
                });
                break;
            }
            case "subscription_expired": {
                const userDoc = await userRef.get();
                const usage = await checkUserUsageAndGracePeriod(userRef, ((_s = userDoc.data()) === null || _s === void 0 ? void 0 : _s.storageUsed) || 0);
                await userRef.update({
                    plan: "free",
                    subscriptionStatus: "expired",
                    currentPeriodEnd: null,
                    downgradeGracePeriodEnd: usage.gracePeriodEnd
                        ? usage.gracePeriodEnd
                        : admin.firestore.FieldValue.delete(),
                });
                break;
            }
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
// ─── syncSubscriptionStatus ──────────────────────────────────────────────────
// Verifies the user's current subscription status with Lemon Squeezy and
// downgrades to Free tier immediately if cancelled or expired.
exports.syncSubscriptionStatus = (0, https_1.onCall)({ secrets: ["LEMONSQUEEZY_API_KEY"] }, async (request) => {
    var _a, _b, _c, _d, _e, _f;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    const userRef = db.collection("users").doc(request.auth.uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
        return { plan: "free", status: null };
    }
    const data = userDoc.data() || {};
    if (await isUserExempt(request.auth.uid)) {
        if (data.plan !== "pro" || data.subscriptionStatus !== "active") {
            await userRef.update({
                plan: "pro",
                subscriptionStatus: "active",
                downgradeGracePeriodEnd: admin.firestore.FieldValue.delete(),
            });
        }
        await syncUserPlanClaim(request.auth.uid, "pro");
        return { plan: "pro", status: "active" };
    }
    const rawPlan = (_a = data.plan) !== null && _a !== void 0 ? _a : "free";
    const rawStatus = (_b = data.subscriptionStatus) !== null && _b !== void 0 ? _b : null;
    const periodEnd = (_e = (_d = (_c = data.currentPeriodEnd) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : _d.call(_c)) !== null && _e !== void 0 ? _e : null;
    if (rawPlan !== "pro") {
        return { plan: "free", status: rawStatus };
    }
    const isExpiredByDate = periodEnd !== null && periodEnd <= new Date();
    if (rawStatus === "cancelled" || rawStatus === "expired" || isExpiredByDate) {
        const nextStatus = isExpiredByDate ? "expired" : rawStatus;
        const usage = await checkUserUsageAndGracePeriod(userRef, data.storageUsed || 0);
        await userRef.update({
            plan: "free",
            subscriptionStatus: nextStatus,
            currentPeriodEnd: null,
            downgradeGracePeriodEnd: usage.gracePeriodEnd
                ? usage.gracePeriodEnd
                : admin.firestore.FieldValue.delete(),
        });
        return { plan: "free", status: nextStatus };
    }
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    const subId = typeof data.subscriptionId === "string" ? data.subscriptionId.trim() : "";
    if (apiKey && /^\d+$/.test(subId)) {
        try {
            const subRes = await lsRequest(`/v1/subscriptions/${subId}`, "GET", apiKey);
            const attrs = (_f = subRes.data) === null || _f === void 0 ? void 0 : _f.attributes;
            if (attrs) {
                const isCancelledOrExpired = attrs.cancelled === true ||
                    attrs.status === "cancelled" ||
                    attrs.status === "expired";
                if (isCancelledOrExpired) {
                    const nextStatus = attrs.status === "expired" ? "expired" : "cancelled";
                    const usage = await checkUserUsageAndGracePeriod(userRef, data.storageUsed || 0);
                    await userRef.update({
                        plan: "free",
                        subscriptionStatus: nextStatus,
                        currentPeriodEnd: null,
                        downgradeGracePeriodEnd: usage.gracePeriodEnd
                            ? usage.gracePeriodEnd
                            : admin.firestore.FieldValue.delete(),
                    });
                    return { plan: "free", status: nextStatus };
                }
            }
        }
        catch (err) {
            console.warn(`Failed to verify subscription ${subId} with Lemon Squeezy:`, err);
        }
    }
    if (rawPlan === "pro" && (rawStatus === "active" || rawStatus === "on_trial")) {
        await syncUserPlanClaim(request.auth.uid, "pro");
    }
    return { plan: rawPlan, status: rawStatus };
});
// ─── createBillingPortalSession ──────────────────────────────────────────────
// Returns the Lemon Squeezy customer portal URL for a given subscription or customer.
// Prevents downgrading if the user exceeds Free tier limits (> 10 credentials or > 500 MB storage).
exports.createBillingPortalSession = (0, https_1.onCall)({ secrets: ["LEMONSQUEEZY_API_KEY"] }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    if (!request.auth)
        throw new https_1.HttpsError("unauthenticated", "Must be signed in.");
    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "Lemon Squeezy not configured.");
    }
    const userRef = admin.firestore().collection("users").doc(request.auth.uid);
    const userDoc = await userRef.get();
    const usage = await checkUserUsageAndGracePeriod(userRef, ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.storageUsed) || 0);
    if (usage.exceedsFreeLimit) {
        throw new https_1.HttpsError("failed-precondition", "Please delete your excess credentials and file storage size to be within the Free tier limit (10 credentials, 500 MB storage) before downgrading. Failure to do so before the billing date may result in a charge.");
    }
    const subId = (_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.subscriptionId;
    const custId = (_c = userDoc.data()) === null || _c === void 0 ? void 0 : _c.lsCustomerId;
    let portalUrl;
    if (subId && typeof subId === "string" && subId.trim() !== "") {
        try {
            const response = await lsRequest(`/v1/subscriptions/${subId.trim()}`, "GET", apiKey);
            portalUrl = (_f = (_e = (_d = response.data) === null || _d === void 0 ? void 0 : _d.attributes) === null || _e === void 0 ? void 0 : _e.urls) === null || _f === void 0 ? void 0 : _f.customer_portal;
        }
        catch (err) {
            console.warn(`Failed to fetch portal via subscription ${subId}`, err);
        }
    }
    // Fallback to customer endpoint if subscription fails or is missing
    if (!portalUrl && custId && typeof custId === "string" && custId.trim() !== "") {
        try {
            const response = await lsRequest(`/v1/customers/${custId.trim()}`, "GET", apiKey);
            portalUrl = (_j = (_h = (_g = response.data) === null || _g === void 0 ? void 0 : _g.attributes) === null || _h === void 0 ? void 0 : _h.urls) === null || _j === void 0 ? void 0 : _j.customer_portal;
        }
        catch (err) {
            console.warn(`Failed to fetch portal via customer ${custId}`, err);
        }
    }
    // Fallback to searching customer by email if we don't have custId in db or it failed
    if (!portalUrl && request.auth.token.email) {
        try {
            const email = request.auth.token.email;
            console.log("Looking up by email:", email);
            const searchResponse = await lsRequest(`/v1/customers?filter[email]=${encodeURIComponent(email)}`, "GET", apiKey);
            console.log("Search response:", JSON.stringify(searchResponse));
            if (searchResponse.data && searchResponse.data.length > 0) {
                // If we found a customer by email, try to use its portal URL
                portalUrl = (_l = (_k = searchResponse.data[0].attributes) === null || _k === void 0 ? void 0 : _k.urls) === null || _l === void 0 ? void 0 : _l.customer_portal;
                // Save it back to db for future use if we found it
                if (portalUrl) {
                    await userRef.update({
                        lsCustomerId: searchResponse.data[0].id
                    });
                }
            }
        }
        catch (err) {
            console.warn(`Failed to fetch portal via email search`, err);
        }
    }
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
    const credentialsSnap = await db.collectionGroup("credentials").select("platform").limit(5000).get();
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
// ─── Google OAuth for In-App Browsers ────────────────────────────────────────
const GOOGLE_CLIENT_SECRET = (0, params_1.defineSecret)("GOOGLE_CLIENT_SECRET");
const GOOGLE_CLIENT_ID = (0, params_1.defineSecret)("GOOGLE_CLIENT_ID");
const googleOAuth_1 = require("./googleOAuth");
// Hardcoded redirect URI — must match exactly what is whitelisted in Google Cloud Console
const PRODUCTION_REDIRECT_URI = "https://us-central1-fort-knox-6978d.cloudfunctions.net/googleAuthCallback";
// Helper to determine redirect URI for the callback
function getRedirectUri(req) {
    const host = req.get("host");
    if (host === null || host === void 0 ? void 0 : host.includes("localhost")) {
        return `http://${host}/fort-knox-6978d/us-central1/googleAuthCallback`;
    }
    return PRODUCTION_REDIRECT_URI;
}
exports.googleAuthStart = (0, https_1.onRequest)({ secrets: [GOOGLE_CLIENT_ID], cors: true, invoker: "public" }, (req, res) => {
    // We expect the frontend to pass the client ID as a query param, or we can use a hardcoded one if preferred.
    // For now, we will use the secret defined GOOGLE_CLIENT_ID or fallback to a query parameter.
    const clientId = GOOGLE_CLIENT_ID.value();
    const returnUrl = (0, googleOAuth_1.decodeReturnUrl)(req.query.returnUrl, req.headers.origin || "https://fortsterling.app");
    // We dynamically build the redirectUri based on the current request
    const redirectUri = getRedirectUri(req);
    const loginHint = typeof req.query.loginHint === "string" ? req.query.loginHint : undefined;
    res.redirect(302, (0, googleOAuth_1.buildGoogleAuthUrl)(clientId, returnUrl, redirectUri, req.headers.origin || "https://fortsterling.app", loginHint));
});
exports.googleAuthCallback = (0, https_1.onRequest)({ secrets: [GOOGLE_CLIENT_SECRET, GOOGLE_CLIENT_ID], invoker: "public" }, async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;
    const returnUrl = (0, googleOAuth_1.parseOAuthState)(state, req.headers.origin || "https://fortsterling.app");
    const redirectUri = getRedirectUri(req);
    console.log("googleAuthCallback: redirectUri =", redirectUri, "| host =", req.get("host"), "| code present =", !!code);
    if (error) {
        console.error("OAuth Error:", error);
        res.redirect(302, (0, googleOAuth_1.appendQueryParam)(returnUrl, "error", "auth_failed"));
        return;
    }
    if (!code) {
        res.redirect(302, (0, googleOAuth_1.appendQueryParam)(returnUrl, "error", "no_code"));
        return;
    }
    try {
        const { customToken } = await (0, googleOAuth_1.completeGoogleOAuth)({
            clientId: GOOGLE_CLIENT_ID.value(),
            code,
            redirectUri,
            clientSecret: GOOGLE_CLIENT_SECRET.value(),
        });
        res.redirect(302, (0, googleOAuth_1.appendQueryParam)(returnUrl, "token", customToken));
    }
    catch (err) {
        console.error("Error processing OAuth callback:", err);
        const errString = err.message || "server_error";
        res.redirect(302, (0, googleOAuth_1.appendQueryParam)(returnUrl, "error", errString));
    }
});
exports.exchangeGoogleAuthCode = (0, https_1.onCall)({ secrets: [GOOGLE_CLIENT_SECRET, GOOGLE_CLIENT_ID], cors: true }, async (request) => {
    const data = request.data || {};
    const code = data.code;
    const redirectUri = data.redirectUri;
    if (!code || !redirectUri) {
        throw new https_1.HttpsError("invalid-argument", "Missing authorization code or redirect URI.");
    }
    try {
        const { customToken } = await (0, googleOAuth_1.completeGoogleOAuth)({
            clientId: GOOGLE_CLIENT_ID.value(),
            code,
            redirectUri,
            clientSecret: GOOGLE_CLIENT_SECRET.value(),
        });
        return { customToken };
    }
    catch (err) {
        console.error("exchangeGoogleAuthCode failed:", err);
        throw new https_1.HttpsError("internal", "Failed to complete Google sign-in.");
    }
});
// ─── autoDeleteExcessData ──────────────────────────────────────────────────
// Runs daily to automatically delete data for users whose grace period has expired.
exports.autoDeleteExcessData = (0, scheduler_1.onSchedule)("every day 00:00", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const usersSnap = await db.collection("users")
        .where("downgradeGracePeriodEnd", "<=", now)
        .get();
    for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const userRef = db.collection("users").doc(uid);
        console.log(`Processing auto-delete for user ${uid}`);
        try {
            if (await isUserExempt(uid)) {
                await userRef.update({
                    downgradeGracePeriodEnd: admin.firestore.FieldValue.delete()
                });
                continue;
            }
            // 1. Delete excess credentials
            const credsSnap = await userRef.collection("credentials")
                .orderBy("createdAt", "desc")
                .get();
            if (credsSnap.size > 10) {
                const toDelete = credsSnap.docs.slice(0, credsSnap.size - 10); // Keep oldest 10, delete newest
                console.log(`Deleting ${toDelete.length} excess credentials for user ${uid}`);
                const batch = db.batch();
                let batchCount = 0;
                for (const doc of toDelete) {
                    batch.delete(doc.ref);
                    // Delete credential history subcollection as well
                    const historySnap = await doc.ref.collection("history").get();
                    for (const histDoc of historySnap.docs) {
                        batch.delete(histDoc.ref);
                        batchCount++;
                    }
                    batchCount++;
                    if (batchCount >= 400) {
                        await batch.commit();
                        batchCount = 0;
                    }
                }
                if (batchCount > 0) {
                    await batch.commit();
                }
            }
            // 2. Delete excess files
            const filesSnap = await userRef.collection("files")
                .orderBy("createdAt", "desc")
                .get();
            let storageUsed = userDoc.data().storageUsed || 0;
            const LIMIT_500MB = 500 * 1024 * 1024;
            if (storageUsed > LIMIT_500MB) {
                const batch = db.batch();
                let batchCount = 0;
                for (const fileDoc of filesSnap.docs) {
                    if (storageUsed <= LIMIT_500MB)
                        break;
                    const fileData = fileDoc.data();
                    const size = fileData.size || 0;
                    const fullPath = fileData.fullPath || fileData.storagePath;
                    if (fullPath) {
                        // Delete from Firebase Storage
                        try {
                            const bucket = admin.storage().bucket();
                            await bucket.file(fullPath).delete();
                            console.log(`Deleted file from storage: ${fullPath}`);
                        }
                        catch (err) {
                            if (err.code !== 404) {
                                console.warn(`Failed to delete storage file ${fullPath}:`, err);
                            }
                        }
                    }
                    // Delete from Firestore
                    batch.delete(fileDoc.ref);
                    storageUsed -= size;
                    batchCount++;
                    if (batchCount >= 400) {
                        await batch.commit();
                        batchCount = 0;
                    }
                }
                if (batchCount > 0) {
                    await batch.commit();
                }
                // Update storageUsed on user document
                await userRef.update({ storageUsed: Math.max(0, storageUsed) });
            }
            // 2b. If still above 500MB, delete excess copied items in Shared with Me
            if (storageUsed > LIMIT_500MB) {
                const receivedSharesSnap = await db.collection("shares")
                    .where("recipientUids", "array-contains", uid)
                    .get();
                const sortedShareDocs = [...receivedSharesSnap.docs].sort((a, b) => {
                    var _a, _b, _c, _d, _e, _f;
                    const aMs = (_c = (_b = (_a = a.data().createdAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
                    const bMs = (_f = (_e = (_d = b.data().createdAt) === null || _d === void 0 ? void 0 : _d.toMillis) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : 0;
                    return bMs - aMs;
                });
                for (const shareDoc of sortedShareDocs) {
                    if (storageUsed <= LIMIT_500MB)
                        break;
                    const s = shareDoc.data();
                    const sFiles = s.files || [];
                    const shareSize = sFiles.reduce((sum, f) => sum + (Number(f.size) || 0), 0);
                    const recipientUids = Array.isArray(s.recipientUids) ? s.recipientUids : [];
                    const remaining = recipientUids.filter((r) => r !== uid);
                    if (remaining.length === 0) {
                        for (const f of sFiles) {
                            if (!f.storagePath)
                                continue;
                            try {
                                await admin.storage().bucket().file(f.storagePath).delete({ ignoreNotFound: true });
                            }
                            catch (err) {
                                console.warn(`Failed to delete shared file ${f.storagePath}:`, err);
                            }
                        }
                        await shareDoc.ref.delete();
                    }
                    else {
                        await shareDoc.ref.update({
                            recipientUids: remaining,
                            recipients: (s.recipients || []).filter((r) => r.uid !== uid),
                            [`wrappedKeys.${uid}`]: admin.firestore.FieldValue.delete(),
                        });
                    }
                    storageUsed -= shareSize;
                }
                await userRef.update({ storageUsed: Math.max(0, storageUsed) });
            }
            // 3. Clear the grace period flag so we don't process them again
            await userRef.update({
                downgradeGracePeriodEnd: admin.firestore.FieldValue.delete()
            });
            console.log(`Finished processing auto-delete for user ${uid}`);
        }
        catch (err) {
            console.error(`Error auto-deleting data for user ${uid}:`, err);
        }
    }
});
// --- File Sharing (see sharing.ts) ---
__exportStar(require("./sharing"), exports);
//# sourceMappingURL=index.js.map