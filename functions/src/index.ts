import * as admin from "firebase-admin";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
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
// One-time setup function. Grant admin privileges to the hard-coded email.
// This can be called once and then removed or left disabled.
export const setAdminClaim = onCall(async (request) => {
    assertAdmin(request.auth);

    const uid = request.data?.uid;
    const revoke = request.data?.revoke === true;

    if (!uid || typeof uid !== "string") {
        throw new HttpsError("invalid-argument", "Target UID is required.");
    }

    await admin.auth().setCustomUserClaims(uid, revoke ? { admin: false } : { admin: true });
    return { success: true, message: `Admin claim ${revoke ? 'revoked from' : 'granted to'} user ${uid}.` };
});

// Removed escrow functionality for true zero-knowledge security.

// ══════════════════════════════════════════════════════════════════════════════
//  LEMON SQUEEZY SUBSCRIPTION INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════


import * as https from "https";

/** Helper: POST to Lemon Squeezy REST API */
function lsRequest<T>(
    path: string,
    method: "GET" | "POST",
    apiKey: string,
    body?: object
): Promise<T> {
    return new Promise((resolve, reject) => {
        const payload = body ? JSON.stringify(body) : undefined;
        const req = https.request(
            {
                hostname: "api.lemonsqueezy.com",
                path,
                method,
                headers: {
                    "Accept": "application/vnd.api+json",
                    "Content-Type": "application/vnd.api+json",
                    "Authorization": `Bearer ${apiKey.trim()}`,
                    ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
                },
            },
            (res) => {
                let data = "";
                res.on("data", (chunk) => (data += chunk));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(data) as T);
                    } catch {
                        reject(new Error(`Invalid JSON from Lemon Squeezy: ${data}`));
                    }
                });
            }
        );
        req.on("error", reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// ─── createCheckoutSession ───────────────────────────────────────────────────
// Called from the frontend when a user clicks "Upgrade".
// Creates a Lemon Squeezy hosted checkout session and returns its URL.
export const createCheckoutSession = onCall(
    { secrets: ["LEMONSQUEEZY_API_KEY", "LEMONSQUEEZY_STORE_ID"] },
    async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const variantId = request.data?.variantId;
    if (!variantId || typeof variantId !== "string") {
        throw new HttpsError("invalid-argument", "variantId is required.");
    }

    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!apiKey || !storeId) {
        throw new HttpsError("failed-precondition", "Lemon Squeezy not configured.");
    }

    // Fetch user email for pre-filling the checkout form
    const userRecord = await admin.auth().getUser(request.auth.uid);

    interface CheckoutResponse {
        data?: { attributes?: { url?: string } };
        errors?: { title: string }[];
    }

    const response = await lsRequest<CheckoutResponse>(
        "/v1/checkouts",
        "POST",
        apiKey,
        {
            data: {
                type: "checkouts",
                attributes: {
                    checkout_data: {
                        email: userRecord.email ?? undefined,
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
        }
    );

    const checkoutUrl = response.data?.attributes?.url;
    if (!checkoutUrl) {
        console.error("Lemon Squeezy checkout error:", JSON.stringify(response));
        throw new HttpsError("internal", "Failed to create checkout session.");
    }

    return { checkoutUrl };
});

// ─── lemonWebhook ────────────────────────────────────────────────────────────
// Public HTTPS endpoint for Lemon Squeezy to POST events to.
// Verifies HMAC-SHA256 signature before processing.
export const lemonWebhook = onRequest(
    { secrets: ["LEMONSQUEEZY_WEBHOOK_SECRET"] },
    async (req, res) => {
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
    const signature = req.headers["x-signature"] as string | undefined;
    if (!signature) {
        res.status(401).send("Missing signature");
        return;
    }

    // req.rawBody is available in Firebase Functions v2
    const rawBody = (req as { rawBody?: Buffer }).rawBody;
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
    const payload = JSON.parse(rawBody.toString("utf8")) as Record<string, any>;
    const eventName: string = payload.meta?.event_name ?? "";
    const uid: string | undefined = payload.meta?.custom_data?.user_id;
    const attributes = payload.data?.attributes ?? {};

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
                    subscriptionId: String(payload.data?.id ?? ""),
                    subscriptionStatus: attributes.status === "on_trial" ? "active" : (attributes.status ?? "active"),
                    currentPeriodEnd: attributes.renews_at
                        ? admin.firestore.Timestamp.fromDate(new Date(attributes.renews_at))
                        : null,
                    lsCustomerId: String(attributes.customer_id ?? ""),
                    downgradeGracePeriodEnd: admin.firestore.FieldValue.delete(),
                });
                break;

            case "subscription_updated":
                await userRef.update({
                    subscriptionStatus: attributes.status === "on_trial" ? "active" : (attributes.status ?? "active"),
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

            case "subscription_expired": {
                const userDoc = await userRef.get();
                const storageUsed = userDoc.data()?.storageUsed || 0;
                
                const credsSnap = await userRef.collection("credentials").count().get();
                const credsCount = credsSnap.data().count;
                
                let gracePeriodEnd: admin.firestore.Timestamp | null = null;
                if (credsCount > 10 || storageUsed > 500 * 1024 * 1024) {
                    const d = new Date();
                    d.setDate(d.getDate() + 7);
                    gracePeriodEnd = admin.firestore.Timestamp.fromDate(d);
                }

                await userRef.update({
                    plan: "free",
                    subscriptionStatus: "expired",
                    ...(gracePeriodEnd ? { downgradeGracePeriodEnd: gracePeriodEnd } : {}),
                });
                break;
            }

            default:
                console.log(`Unhandled Lemon Squeezy event: ${eventName}`);
        }
    } catch (err) {
        console.error(`Failed to process ${eventName} for uid ${uid}:`, err);
    }

    // Always respond 200 so Lemon Squeezy doesn't retry unnecessarily
    res.status(200).send("ok");
});

// ─── createBillingPortalSession ──────────────────────────────────────────────
// Returns the Lemon Squeezy customer portal URL for a given subscription or customer.
export const createBillingPortalSession = onCall(
    { secrets: ["LEMONSQUEEZY_API_KEY"] },
    async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    if (!apiKey) {
        throw new HttpsError("failed-precondition", "Lemon Squeezy not configured.");
    }

    const userDoc = await admin.firestore().collection("users").doc(request.auth.uid).get();
    const subId = userDoc.data()?.subscriptionId;
    const custId = userDoc.data()?.lsCustomerId;

    interface SubResponse {
        data?: { attributes?: { urls?: { customer_portal?: string } } };
    }

    let portalUrl: string | undefined;

    if (subId && typeof subId === "string" && subId.trim() !== "") {
        try {
            const response = await lsRequest<SubResponse>(
                `/v1/subscriptions/${subId.trim()}`,
                "GET",
                apiKey
            );
            portalUrl = response.data?.attributes?.urls?.customer_portal;
        } catch (err) {
            console.warn(`Failed to fetch portal via subscription ${subId}`, err);
        }
    }

    // Fallback to customer endpoint if subscription fails or is missing
    if (!portalUrl && custId && typeof custId === "string" && custId.trim() !== "") {
        try {
            const response = await lsRequest<SubResponse>(
                `/v1/customers/${custId.trim()}`,
                "GET",
                apiKey
            );
            portalUrl = response.data?.attributes?.urls?.customer_portal;
        } catch (err) {
            console.warn(`Failed to fetch portal via customer ${custId}`, err);
        }
    }

    // Fallback to searching customer by email if we don't have custId in db or it failed
    if (!portalUrl && request.auth.token.email) {
        try {
            const email = request.auth.token.email;
            console.log("Looking up by email:", email);
            const searchResponse = await lsRequest<{ data?: { id: string, attributes?: { urls?: { customer_portal?: string } } }[] }>(
                `/v1/customers?filter[email]=${encodeURIComponent(email)}`,
                "GET",
                apiKey
            );
            console.log("Search response:", JSON.stringify(searchResponse));
            
            if (searchResponse.data && searchResponse.data.length > 0) {
                // If we found a customer by email, try to use its portal URL
                portalUrl = searchResponse.data[0].attributes?.urls?.customer_portal;
                
                // Save it back to db for future use if we found it
                if (portalUrl) {
                    await admin.firestore().collection("users").doc(request.auth.uid).update({
                        lsCustomerId: searchResponse.data[0].id
                    });
                }
            }
        } catch (err) {
            console.warn(`Failed to fetch portal via email search`, err);
        }
    }

    if (!portalUrl) {
        throw new HttpsError("not-found", "Could not retrieve billing portal URL.");
    }

    return { portalUrl };
});

// ─── getPendingCustomPlatforms ──────────────────────────────────────────────
export const getPendingCustomPlatforms = onCall({ timeoutSeconds: 300 }, async (request) => {
    assertAdmin(request.auth);

    // 1. Fetch all existing global platforms
    const platformsSnap = await db.collection(PLATFORMS_COLLECTION).get();
    const globalPlatformNames = new Set<string>();
    platformsSnap.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
        globalPlatformNames.add(doc.data().name.toLowerCase());
    });

    // 2. Fetch all credentials across all users using a collectionGroup query
    const credentialsSnap = await db.collectionGroup("credentials").get();
    const pendingMap = new Map<string, number>();

    credentialsSnap.forEach((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
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

const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");

import {
    decodeReturnUrl,
    parseOAuthState,
    buildGoogleAuthUrl,
    completeGoogleOAuth,
    appendQueryParam,
} from "./googleOAuth";

// Hardcoded redirect URI — must match exactly what is whitelisted in Google Cloud Console
const PRODUCTION_REDIRECT_URI = "https://us-central1-fort-knox-6978d.cloudfunctions.net/googleAuthCallback";

// Helper to determine redirect URI for the callback
function getRedirectUri(req: any): string {
    const host = req.get("host");
    if (host?.includes("localhost")) {
        return `http://${host}/fort-knox-6978d/us-central1/googleAuthCallback`;
    }
    return PRODUCTION_REDIRECT_URI;
}

export const googleAuthStart = onRequest({ secrets: [GOOGLE_CLIENT_ID], cors: true, invoker: "public" }, (req, res) => {
    // We expect the frontend to pass the client ID as a query param, or we can use a hardcoded one if preferred.
    // For now, we will use the secret defined GOOGLE_CLIENT_ID or fallback to a query parameter.
    const clientId = GOOGLE_CLIENT_ID.value();
    const returnUrl = decodeReturnUrl(req.query.returnUrl as string, req.headers.origin || "https://fortsterling.app");
    
    // We dynamically build the redirectUri based on the current request
    const redirectUri = getRedirectUri(req);

    res.redirect(302, buildGoogleAuthUrl(clientId, returnUrl, redirectUri, req.headers.origin || "https://fortsterling.app"));
});

export const googleAuthCallback = onRequest(
    { secrets: [GOOGLE_CLIENT_SECRET, GOOGLE_CLIENT_ID], invoker: "public" },
    async (req, res) => {
        const code = req.query.code as string;
        const state = req.query.state as string;
        const error = req.query.error as string;
        const returnUrl = parseOAuthState(state, req.headers.origin || "https://fortsterling.app");

        const redirectUri = getRedirectUri(req);
        console.log("googleAuthCallback: redirectUri =", redirectUri, "| host =", req.get("host"), "| code present =", !!code);

        if (error) {
            console.error("OAuth Error:", error);
            res.redirect(302, appendQueryParam(returnUrl, "error", "auth_failed"));
            return;
        }

        if (!code) {
            res.redirect(302, appendQueryParam(returnUrl, "error", "no_code"));
            return;
        }

        try {
            const { customToken } = await completeGoogleOAuth({
                clientId: GOOGLE_CLIENT_ID.value(),
                code,
                redirectUri,
                clientSecret: GOOGLE_CLIENT_SECRET.value(),
            });
            res.redirect(302, appendQueryParam(returnUrl, "token", customToken));
        } catch (err: any) {
            console.error("Error processing OAuth callback:", err);
            const errString = err.message || "server_error";
            res.redirect(302, appendQueryParam(returnUrl, "error", errString));
        }
    }
);

export const exchangeGoogleAuthCode = onCall(
    { secrets: [GOOGLE_CLIENT_SECRET, GOOGLE_CLIENT_ID], cors: true },
    async (request) => {
        const data = request.data || {};
        const code = data.code;
        const redirectUri = data.redirectUri;

        if (!code || !redirectUri) {
            throw new HttpsError("invalid-argument", "Missing authorization code or redirect URI.");
        }

        try {
            const { customToken } = await completeGoogleOAuth({
                clientId: GOOGLE_CLIENT_ID.value(),
                code,
                redirectUri,
                clientSecret: GOOGLE_CLIENT_SECRET.value(),
            });
            return { customToken };
        } catch (err) {
            console.error("exchangeGoogleAuthCode failed:", err);
            throw new HttpsError("internal", "Failed to complete Google sign-in.");
        }
    }
);

// ─── autoDeleteExcessData ──────────────────────────────────────────────────
// Runs daily to automatically delete data for users whose grace period has expired.
export const autoDeleteExcessData = onSchedule("every day 00:00", async (event) => {
    const now = admin.firestore.Timestamp.now();
    const usersSnap = await db.collection("users")
        .where("downgradeGracePeriodEnd", "<=", now)
        .get();

    for (const userDoc of usersSnap.docs) {
        const uid = userDoc.id;
        const userRef = db.collection("users").doc(uid);
        console.log(`Processing auto-delete for user ${uid}`);

        try {
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
                    if (storageUsed <= LIMIT_500MB) break;
                    
                    const fileData = fileDoc.data();
                    const size = fileData.size || 0;
                    const fullPath = fileData.fullPath;
                    
                    if (fullPath) {
                        // Delete from Firebase Storage
                        try {
                            const bucket = admin.storage().bucket();
                            await bucket.file(fullPath).delete();
                            console.log(`Deleted file from storage: ${fullPath}`);
                        } catch (err: any) {
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

            // 3. Clear the grace period flag so we don't process them again
            await userRef.update({
                downgradeGracePeriodEnd: admin.firestore.FieldValue.delete()
            });
            console.log(`Finished processing auto-delete for user ${uid}`);

        } catch (err) {
            console.error(`Error auto-deleting data for user ${uid}:`, err);
        }
    }
});