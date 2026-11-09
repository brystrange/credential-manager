import * as https from "https";
import * as admin from "firebase-admin";

const ALLOWED_HOSTS = new Set([
    "fortsterling.app",
    "www.fortsterling.app",
    "localhost:5173",
    "localhost:3000",
    "localhost:5000",
    "127.0.0.1:5173",
]);

export function isAllowedUrl(urlStr: string): boolean {
    if (!urlStr || typeof urlStr !== "string") return false;
    try {
        const parsed = new URL(urlStr);
        return ALLOWED_HOSTS.has(parsed.host.toLowerCase());
    } catch {
        // Safe relative path (e.g. /auth/callback)
        return urlStr.startsWith("/") && !urlStr.startsWith("//");
    }
}

export function decodeReturnUrl(raw: string | undefined, defaultUrl: string): string {
    if (!raw || typeof raw !== "string") {
        return defaultUrl;
    }
    let decoded = raw;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        decoded = raw;
    }
    return isAllowedUrl(decoded) ? decoded : defaultUrl;
}

export function parseOAuthState(state: string | undefined, defaultUrl: string): string {
    let returnUrl = defaultUrl;
    try {
        if (state) {
            const decodedState = JSON.parse(state);
            if (decodedState.returnUrl) {
                returnUrl = decodeReturnUrl(decodedState.returnUrl, defaultUrl);
            }
        }
    } catch (e) {
        console.error("Failed to parse OAuth state:", e);
    }
    return returnUrl;
}

export function buildGoogleAuthUrl(
    clientId: string,
    returnUrl: string,
    redirectUri: string,
    defaultUrl: string,
    loginHint?: string
): string {
    const validatedUrl = decodeReturnUrl(returnUrl, defaultUrl);
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const state = JSON.stringify({ returnUrl: validatedUrl, nonce });
    return (
        "https://accounts.google.com/o/oauth2/v2/auth?" +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        "&response_type=code" +
        "&scope=openid%20email%20profile" +
        "&access_type=online" +
        "&prompt=select_account" +
        (loginHint && loginHint.trim() ? `&login_hint=${encodeURIComponent(loginHint.trim())}` : "") +
        `&state=${encodeURIComponent(state)}`
    );
}

export function exchangeGoogleCode({
    clientId,
    code,
    redirectUri,
    clientSecret,
}: {
    clientId: string;
    code: string;
    redirectUri: string;
    clientSecret: string;
}): Promise<any> {
    const postData = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
    }).toString();

    return new Promise((resolve, reject) => {
        const tokenReq = https.request(
            {
                hostname: "oauth2.googleapis.com",
                port: 443,
                path: "/token",
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(postData),
                },
            },
            (tokenRes) => {
                let data = "";
                tokenRes.on("data", (chunk) => {
                    data += chunk;
                });
                tokenRes.on("end", () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (err) {
                        reject(err);
                    }
                });
            }
        );

        tokenReq.on("error", reject);
        tokenReq.write(postData);
        tokenReq.end();
    });
}

export function parseGoogleIdToken(idToken: string): any {
    const payloadBase64 = idToken.split(".")[1];
    const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf8");
    return JSON.parse(payloadJson);
}

export function appendQueryParam(url: string, key: string, value: string): string {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}

export async function completeGoogleOAuth({
    clientId,
    code,
    redirectUri,
    clientSecret,
}: {
    clientId: string;
    code: string;
    redirectUri: string;
    clientSecret: string;
}): Promise<{ customToken: string; email: string; displayName: string }> {
    const tokenData = await exchangeGoogleCode({ clientId, code, redirectUri, clientSecret });
    if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error || "token_exchange_failed");
    }

    const profile = parseGoogleIdToken(tokenData.id_token);
    const email = profile.email;
    const displayName = profile.name || "";

    let uid;
    try {
        const userRecord = await admin.auth().getUserByEmail(email);
        uid = userRecord.uid;
    } catch (e: any) {
        if (e.code === "auth/user-not-found") {
            const newUser = await admin.auth().createUser({
                email,
                displayName,
                emailVerified: profile.email_verified,
            });
            uid = newUser.uid;
        } else {
            throw e;
        }
    }

    const customToken = await admin.auth().createCustomToken(uid);
    return { customToken, email, displayName };
}