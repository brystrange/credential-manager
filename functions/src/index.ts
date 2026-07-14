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
// One-time setup function. Grant admin privileges to the hard-coded email.
// This can be called once and then removed or left disabled.
export const setAdminClaim = onCall(async (request) => {
    // Only allow the specific admin email to bootstrap themselves
    const ADMIN_EMAIL = "bryankeithmayor1@gmail.com";

    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    if (request.auth.token.email !== ADMIN_EMAIL) {
        throw new HttpsError("permission-denied", "Not authorised to set admin claims.");
    }

    await admin.auth().setCustomUserClaims(request.auth.uid, { admin: true });
    return { success: true, message: "Admin claim set. Sign out and back in for it to take effect." };
});

// Removed escrow functionality for true zero-knowledge security.

// ══════════════════════════════════════════════════════════════════════════════
//  LEMON SQUEEZY SUBSCRIPTION INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════

import { onRequest } from "firebase-functions/v2/https";
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
                    subscriptionStatus: attributes.status ?? "active",
                    currentPeriodEnd: attributes.renews_at
                        ? admin.firestore.Timestamp.fromDate(new Date(attributes.renews_at))
                        : null,
                    lsCustomerId: String(attributes.customer_id ?? ""),
                });
                break;

            case "subscription_updated":
                await userRef.update({
                    subscriptionStatus: attributes.status ?? "active",
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
    } catch (err) {
        console.error(`Failed to process ${eventName} for uid ${uid}:`, err);
    }

    // Always respond 200 so Lemon Squeezy doesn't retry unnecessarily
    res.status(200).send("ok");
});

// ─── createBillingPortalSession ──────────────────────────────────────────────
// Returns the Lemon Squeezy customer portal URL for a given subscription.
export const createBillingPortalSession = onCall(
    { secrets: ["LEMONSQUEEZY_API_KEY"] },
    async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const subscriptionId = request.data?.subscriptionId;
    if (!subscriptionId || typeof subscriptionId !== "string") {
        throw new HttpsError("invalid-argument", "subscriptionId is required.");
    }

    const apiKey = process.env.LEMONSQUEEZY_API_KEY;
    if (!apiKey) {
        throw new HttpsError("failed-precondition", "Lemon Squeezy not configured.");
    }

    interface SubResponse {
        data?: { attributes?: { urls?: { customer_portal?: string } } };
    }

    const response = await lsRequest<SubResponse>(
        `/v1/subscriptions/${subscriptionId}`,
        "GET",
        apiKey
    );

    const portalUrl = response.data?.attributes?.urls?.customer_portal;
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
