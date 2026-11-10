import { exportKeyToHex } from "./crypto";

const DB_NAME = "FortSterlingBiometrics";
const DB_VERSION = 1;
const STORE_NAME = "biometricRecords";

export type BiometricMode = "prf" | "non-extractable";

export interface BiometricStatus {
    supported: boolean;
    enabled: boolean;
    mode?: BiometricMode;
    enabledAt?: number;
    deviceLabel?: string;
}

interface StoredBiometricRecord {
    uid: string;
    credentialId: string; // base64url
    mode: BiometricMode;
    prfSalt?: string; // base64url (32 bytes, only for mode === "prf")
    wrappingKey?: CryptoKey; // non-extractable (only for mode === "non-extractable")
    iv: string; // base64url (12 bytes)
    wrappedMasterKey: string; // base64url (AES-GCM ciphertext of masterKeyHex)
    enabledAt: number;
    deviceLabel: string;
}

interface PrfExtensionResult {
    enabled?: boolean;
    results?: {
        first?: ArrayBuffer | Uint8Array;
    };
}

function toArrayBuffer(viewOrBuf: ArrayBuffer | Uint8Array): ArrayBuffer {
    if (viewOrBuf instanceof ArrayBuffer) {
        return viewOrBuf;
    }
    const copy = new Uint8Array(viewOrBuf.byteLength);
    copy.set(new Uint8Array(viewOrBuf.buffer, viewOrBuf.byteOffset, viewOrBuf.byteLength));
    return copy.buffer;
}

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): ArrayBuffer {
    const padLen = (4 - (str.length % 4)) % 4;
    const base64 = (str + "=".repeat(padLen)).replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function detectDeviceLabel(): string {
    if (typeof navigator === "undefined") return "This Device";
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return "Face ID / Touch ID (iOS)";
    if (/Android/i.test(ua)) return "Android Biometrics";
    if (/Mac/i.test(ua)) return "Touch ID (macOS)";
    if (/Windows/i.test(ua)) return "Windows Hello";
    return "Platform Authenticator";
}

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
            reject(new Error("IndexedDB is not available in this browser."));
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "uid" });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Failed to open biometric database."));
    });
}

async function getRecord(uid: string): Promise<StoredBiometricRecord | null> {
    const db = await openDb();
    try {
        return await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(uid);
            req.onsuccess = () => resolve((req.result as StoredBiometricRecord) || null);
            req.onerror = () => reject(req.error || new Error("Failed to read biometric record."));
        });
    } finally {
        db.close();
    }
}

async function putRecord(record: StoredBiometricRecord): Promise<void> {
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error || new Error("Failed to save biometric record."));
        });
    } finally {
        db.close();
    }
}

async function deleteRecord(uid: string): Promise<void> {
    if (typeof indexedDB === "undefined") return;
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(uid);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error || new Error("Failed to remove biometric record."));
        });
    } finally {
        db.close();
    }
}

async function derivePrfAesKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        prfOutput,
        "HKDF",
        false,
        ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: new TextEncoder().encode("fort-sterling-biometric-v1"),
            info: new TextEncoder().encode("vault-master-key-wrap"),
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

function mapWebAuthnError(err: unknown, fallback: string): Error {
    if (err instanceof DOMException) {
        if (err.name === "NotAllowedError") {
            return new Error("Biometric verification was cancelled or timed out.");
        }
        if (err.name === "NotSupportedError") {
            return new Error("Biometric authentication is not supported on this device or browser.");
        }
        if (err.name === "SecurityError") {
            return new Error("Biometric authentication requires a secure HTTPS connection.");
        }
        if (err.name === "InvalidStateError") {
            return new Error("Biometric credential state is invalid. Please re-enable biometrics in Settings.");
        }
    }
    return err instanceof Error ? err : new Error(fallback);
}

/**
 * Checks whether the current browser/device supports platform biometric authentication
 * (Face ID, Touch ID, Windows Hello, Android Fingerprint).
 */
export async function isBiometricSupported(): Promise<boolean> {
    if (
        typeof window === "undefined" ||
        !window.isSecureContext ||
        typeof window.PublicKeyCredential === "undefined" ||
        !navigator.credentials ||
        typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable !== "function"
    ) {
        return false;
    }
    try {
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
        return false;
    }
}

/**
 * Checks whether biometric unlock is available and enrolled for the given user on this device.
 */
export async function hasBiometricEnrollment(uid: string): Promise<boolean> {
    if (!uid) return false;
    try {
        const supported = await isBiometricSupported();
        if (!supported) return false;
        const record = await getRecord(uid);
        return Boolean(record && record.credentialId && record.wrappedMasterKey);
    } catch {
        return false;
    }
}

/**
 * Returns full biometric status for displaying in SettingsPage.
 */
export async function getBiometricStatus(uid: string): Promise<BiometricStatus> {
    const supported = await isBiometricSupported();
    if (!supported || !uid) {
        return { supported, enabled: false };
    }
    try {
        const record = await getRecord(uid);
        if (!record) {
            return { supported: true, enabled: false };
        }
        return {
            supported: true,
            enabled: true,
            mode: record.mode,
            enabledAt: record.enabledAt,
            deviceLabel: record.deviceLabel,
        };
    } catch {
        return { supported, enabled: false };
    }
}

/**
 * Enrolls platform biometrics (Fingerprint / Face ID / Windows Hello) for this device
 * and stores the wrapped master key locally in IndexedDB.
 */
export async function enrollBiometricUnlock(
    uid: string,
    email: string,
    masterKey: CryptoKey
): Promise<{ mode: BiometricMode; deviceLabel: string }> {
    const supported = await isBiometricSupported();
    if (!supported) {
        throw new Error("Biometric authentication is not supported on this device or browser.");
    }

    const masterKeyHex = await exportKeyToHex(masterKey);
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));
    const userBytes = new TextEncoder().encode(uid);
    const userIdBuf = new Uint8Array(userBytes).buffer;

    const creationOptions: PublicKeyCredentialCreationOptions = {
        challenge: challenge.buffer,
        rp: {
            name: "Fort Sterling",
            id: window.location.hostname,
        },
        user: {
            id: userIdBuf,
            name: email || uid,
            displayName: email || "Fort Sterling User",
        },
        pubKeyCredParams: [
            { type: "public-key", alg: -7 },   // ES256
            { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
            residentKey: "preferred",
            requireResidentKey: false,
        },
        timeout: 60000,
        attestation: "none",
        extensions: {
            prf: {
                eval: {
                    first: prfSalt.buffer,
                },
            },
        } as unknown as AuthenticationExtensionsClientInputs,
    };

    let credential: PublicKeyCredential | null = null;
    try {
        credential = (await navigator.credentials.create({
            publicKey: creationOptions,
        })) as PublicKeyCredential | null;
    } catch (err) {
        throw mapWebAuthnError(err, "Failed to register biometric credential.");
    }

    if (!credential) {
        throw new Error("Biometric registration did not return a credential.");
    }

    const extResults = (credential.getClientExtensionResults?.() || {}) as {
        prf?: PrfExtensionResult;
    };

    let prfSecretBuf: ArrayBuffer | null = null;
    if (extResults.prf?.results?.first) {
        prfSecretBuf = toArrayBuffer(extResults.prf.results.first);
    } else if (extResults.prf?.enabled) {
        // Some browsers report prf.enabled=true on create() and evaluate on get()
        const evalChallenge = crypto.getRandomValues(new Uint8Array(32));
        try {
            const assertion = (await navigator.credentials.get({
                publicKey: {
                    challenge: evalChallenge.buffer,
                    rpId: window.location.hostname,
                    allowCredentials: [
                        {
                            id: credential.rawId,
                            type: "public-key",
                        },
                    ],
                    userVerification: "required",
                    timeout: 60000,
                    extensions: {
                        prf: {
                            eval: {
                                first: prfSalt.buffer,
                            },
                        },
                    } as unknown as AuthenticationExtensionsClientInputs,
                },
            })) as PublicKeyCredential | null;

            const assertExt = (assertion?.getClientExtensionResults?.() || {}) as {
                prf?: PrfExtensionResult;
            };
            if (assertExt.prf?.results?.first) {
                prfSecretBuf = toArrayBuffer(assertExt.prf.results.first);
            }
        } catch (err) {
            throw mapWebAuthnError(err, "Failed to complete biometric key setup.");
        }
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedMasterKey = new TextEncoder().encode(masterKeyHex);
    const deviceLabel = detectDeviceLabel();
    const credentialId = toBase64Url(credential.rawId);

    if (prfSecretBuf) {
        const wrappingKey = await derivePrfAesKey(prfSecretBuf);
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv.buffer },
            wrappingKey,
            encodedMasterKey
        );

        await putRecord({
            uid,
            credentialId,
            mode: "prf",
            prfSalt: toBase64Url(prfSalt),
            iv: toBase64Url(iv),
            wrappedMasterKey: toBase64Url(ciphertext),
            enabledAt: Date.now(),
            deviceLabel,
        });

        return { mode: "prf", deviceLabel };
    }

    // Fallback for browsers without WebAuthn PRF support: non-extractable Web Crypto key
    const wrappingKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv.buffer },
        wrappingKey,
        encodedMasterKey
    );

    await putRecord({
        uid,
        credentialId,
        mode: "non-extractable",
        wrappingKey,
        iv: toBase64Url(iv),
        wrappedMasterKey: toBase64Url(ciphertext),
        enabledAt: Date.now(),
        deviceLabel,
    });

    return { mode: "non-extractable", deviceLabel };
}

/**
 * Triggers the device biometric prompt and unwraps the stored Master Key hex.
 */
export async function unwrapMasterKeyWithBiometrics(uid: string): Promise<string> {
    if (!uid) {
        throw new Error("No authenticated user found.");
    }
    const supported = await isBiometricSupported();
    if (!supported) {
        throw new Error("Biometric authentication is not supported on this browser.");
    }

    const record = await getRecord(uid);
    if (!record) {
        throw new Error("Biometric unlock is not enabled on this device.");
    }

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const requestOptions: PublicKeyCredentialRequestOptions = {
        challenge: challenge.buffer,
        rpId: window.location.hostname,
        allowCredentials: [
            {
                id: fromBase64Url(record.credentialId),
                type: "public-key",
            },
        ],
        userVerification: "required",
        timeout: 60000,
    };

    if (record.mode === "prf" && record.prfSalt) {
        requestOptions.extensions = {
            prf: {
                eval: {
                    first: fromBase64Url(record.prfSalt),
                },
            },
        } as unknown as AuthenticationExtensionsClientInputs;
    }

    let assertion: PublicKeyCredential | null = null;
    try {
        assertion = (await navigator.credentials.get({
            publicKey: requestOptions,
        })) as PublicKeyCredential | null;
    } catch (err) {
        throw mapWebAuthnError(err, "Biometric verification failed.");
    }

    if (!assertion) {
        throw new Error("Biometric verification failed.");
    }

    let unwrappingKey: CryptoKey;
    if (record.mode === "prf") {
        const extResults = (assertion.getClientExtensionResults?.() || {}) as {
            prf?: PrfExtensionResult;
        };
        const first = extResults.prf?.results?.first;
        if (!first) {
            throw new Error("Biometric hardware key was not returned. Please unlock with your password.");
        }
        unwrappingKey = await derivePrfAesKey(toArrayBuffer(first));
    } else {
        if (!record.wrappingKey) {
            throw new Error("Stored biometric wrapping key is missing. Please re-enable biometrics.");
        }
        unwrappingKey = record.wrappingKey;
    }

    let plaintextBuf: ArrayBuffer;
    try {
        plaintextBuf = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fromBase64Url(record.iv) },
            unwrappingKey,
            fromBase64Url(record.wrappedMasterKey)
        );
    } catch {
        throw new Error("Failed to decrypt biometric key. Please unlock with your vault password.");
    }

    const masterKeyHex = new TextDecoder().decode(plaintextBuf);
    if (!/^[0-9a-f]{64}$/i.test(masterKeyHex)) {
        throw new Error("Unwrapped vault key is invalid.");
    }

    return masterKeyHex;
}

/**
 * Removes stored biometric enrollment for the given user on this device.
 */
export async function disableBiometricUnlock(uid: string): Promise<void> {
    if (!uid) return;
    await deleteRecord(uid);
}
