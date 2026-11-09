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
exports.isAllowedUrl = isAllowedUrl;
exports.decodeReturnUrl = decodeReturnUrl;
exports.parseOAuthState = parseOAuthState;
exports.buildGoogleAuthUrl = buildGoogleAuthUrl;
exports.exchangeGoogleCode = exchangeGoogleCode;
exports.parseGoogleIdToken = parseGoogleIdToken;
exports.appendQueryParam = appendQueryParam;
exports.completeGoogleOAuth = completeGoogleOAuth;
const https = __importStar(require("https"));
const admin = __importStar(require("firebase-admin"));
const ALLOWED_HOSTS = new Set([
    "fortsterling.app",
    "www.fortsterling.app",
    "localhost:5173",
    "localhost:3000",
    "localhost:5000",
    "127.0.0.1:5173",
]);
function isAllowedUrl(urlStr) {
    if (!urlStr || typeof urlStr !== "string")
        return false;
    try {
        const parsed = new URL(urlStr);
        return ALLOWED_HOSTS.has(parsed.host.toLowerCase());
    }
    catch (_a) {
        // Safe relative path (e.g. /auth/callback)
        return urlStr.startsWith("/") && !urlStr.startsWith("//");
    }
}
function decodeReturnUrl(raw, defaultUrl) {
    if (!raw || typeof raw !== "string") {
        return defaultUrl;
    }
    let decoded = raw;
    try {
        decoded = decodeURIComponent(raw);
    }
    catch (_a) {
        decoded = raw;
    }
    return isAllowedUrl(decoded) ? decoded : defaultUrl;
}
function parseOAuthState(state, defaultUrl) {
    let returnUrl = defaultUrl;
    try {
        if (state) {
            const decodedState = JSON.parse(state);
            if (decodedState.returnUrl) {
                returnUrl = decodeReturnUrl(decodedState.returnUrl, defaultUrl);
            }
        }
    }
    catch (e) {
        console.error("Failed to parse OAuth state:", e);
    }
    return returnUrl;
}
function buildGoogleAuthUrl(clientId, returnUrl, redirectUri, defaultUrl, loginHint) {
    const validatedUrl = decodeReturnUrl(returnUrl, defaultUrl);
    const nonce = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const state = JSON.stringify({ returnUrl: validatedUrl, nonce });
    return ("https://accounts.google.com/o/oauth2/v2/auth?" +
        `client_id=${clientId}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        "&response_type=code" +
        "&scope=openid%20email%20profile" +
        "&access_type=online" +
        "&prompt=select_account" +
        (loginHint && loginHint.trim() ? `&login_hint=${encodeURIComponent(loginHint.trim())}` : "") +
        `&state=${encodeURIComponent(state)}`);
}
function exchangeGoogleCode({ clientId, code, redirectUri, clientSecret, }) {
    const postData = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
    }).toString();
    return new Promise((resolve, reject) => {
        const tokenReq = https.request({
            hostname: "oauth2.googleapis.com",
            port: 443,
            path: "/token",
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Content-Length": Buffer.byteLength(postData),
            },
        }, (tokenRes) => {
            let data = "";
            tokenRes.on("data", (chunk) => {
                data += chunk;
            });
            tokenRes.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                }
                catch (err) {
                    reject(err);
                }
            });
        });
        tokenReq.on("error", reject);
        tokenReq.write(postData);
        tokenReq.end();
    });
}
function parseGoogleIdToken(idToken) {
    const payloadBase64 = idToken.split(".")[1];
    const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf8");
    return JSON.parse(payloadJson);
}
function appendQueryParam(url, key, value) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${key}=${encodeURIComponent(value)}`;
}
async function completeGoogleOAuth({ clientId, code, redirectUri, clientSecret, }) {
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
    }
    catch (e) {
        if (e.code === "auth/user-not-found") {
            const newUser = await admin.auth().createUser({
                email,
                displayName,
                emailVerified: profile.email_verified,
            });
            uid = newUser.uid;
        }
        else {
            throw e;
        }
    }
    const customToken = await admin.auth().createCustomToken(uid);
    return { customToken, email, displayName };
}
//# sourceMappingURL=googleOAuth.js.map