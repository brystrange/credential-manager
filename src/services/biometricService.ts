import { exportKeyToHex } from "./crypto";

const DB_NAME = "FortSterlingBiometrics";
const DB_VERSION = 1;
const STORE_NAME = "biometricRecords";

export type BiometricMode = "prf" | "non-extractable";
export type VerificationMethod = "windows" | "ios" | "mac" | "android" | "device";

export interface VerificationErrorMessages {
    cancelled: string;
    unsupported: string;
    httpsRequired: string;
    invalidState: string;
    notEnabled: string;
    failed: string;
    noHardwareKey: string;
    missingWrappingKey: string;
    decryptFailed: string;
    registerFailed: string;
    noCredential: string;
    setupFailed: string;
    unlockFailed: string;
    enableFailed: string;
    disableFailed: string;
    keyMismatch: string;
}

export interface VerificationProfile {
    method: VerificationMethod;
    name: string;
    shortName: string;
    deviceLabel: string;
    sectionTitle: string;
    enable: string;
    unlock: string;
    disable: string;
    keyGateLabel: string;
    errors: VerificationErrorMessages;
}

export interface BiometricStatus {
    supported: boolean;
    enabled: boolean;
    method?: VerificationMethod;
    mode?: BiometricMode;
    enabledAt?: number;
    deviceLabel?: string;
}

interface StoredBiometricRecord {
    uid: string;
    credentialId: string; // base64url
    mode: BiometricMode;
    method?: VerificationMethod;
    transports?: AuthenticatorTransport[];
    prfSalt?: string; // base64url (32 bytes, only for mode === "prf")
    wrappingKey?: CryptoKey; // non-extractable (only for mode === "non-extractable")
    iv: string; // base64url (12 bytes)
    wrappedMasterKey: string; // base64url (AES-GCM ciphertext of masterKeyHex)
    enabledAt: number;
    deviceLabel: string;
}

const cachedRecords = new Map<string, StoredBiometricRecord>();

function hasWebAuthnApi(): boolean {
    return (
        typeof window !== "undefined" &&
        Boolean(window.isSecureContext) &&
        typeof window.PublicKeyCredential !== "undefined" &&
        Boolean(navigator.credentials)
    );
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

interface ProfileSeed {
    method: VerificationMethod;
    name: string;
    shortName: string;
    reenableTarget: string;
    deviceLabel: string;
    sectionTitle: string;
    enable: string;
    unlock: string;
    disable: string;
    keyGateLabel: string;
}

function buildVerificationProfile(seed: ProfileSeed): VerificationProfile {
    const { name, shortName, reenableTarget } = seed;
    return {
        method: seed.method,
        name,
        shortName,
        deviceLabel: seed.deviceLabel,
        sectionTitle: seed.sectionTitle,
        enable: seed.enable,
        unlock: seed.unlock,
        disable: seed.disable,
        keyGateLabel: seed.keyGateLabel,
        errors: {
            cancelled: `${name} verification was cancelled or timed out.`,
            unsupported: `${shortName} authentication is not supported on this device or browser.`,
            httpsRequired: `${shortName} authentication requires a secure HTTPS connection.`,
            invalidState: `${shortName} credential state is invalid. Please re-enable ${reenableTarget} in Settings.`,
            notEnabled: `${shortName} unlock is not enabled on this device.`,
            failed: `${name} verification failed.`,
            noHardwareKey: `${shortName} key was not returned. Please unlock with your password.`,
            missingWrappingKey: `Stored ${shortName.toLowerCase()} wrapping key is missing. Please re-enable ${reenableTarget} in Settings.`,
            decryptFailed: `Failed to decrypt ${shortName.toLowerCase()} key. Please unlock with your vault password.`,
            registerFailed: `Failed to register ${shortName.toLowerCase()} credential.`,
            noCredential: `${shortName} registration did not return a credential.`,
            setupFailed: `Failed to complete ${shortName.toLowerCase()} key setup.`,
            unlockFailed: `${name} unlock failed. Please enter your password.`,
            enableFailed: `Failed to enable ${shortName.toLowerCase()} unlock.`,
            disableFailed: `Failed to disable ${shortName.toLowerCase()} unlock.`,
            keyMismatch: `${shortName} key does not match your current vault. Please unlock with your password.`,
        },
    };
}

const VERIFICATION_PROFILES: Record<VerificationMethod, VerificationProfile> = {
    windows: buildVerificationProfile({
        method: "windows",
        name: "Windows Hello / PIN",
        shortName: "Windows Hello",
        reenableTarget: "Windows Hello",
        deviceLabel: "Windows Hello",
        sectionTitle: "Windows Hello Unlock",
        enable: "Enable Windows Hello (PIN / Biometrics)",
        unlock: "Unlock with Windows Hello / PIN",
        disable: "Disable Windows Hello Unlock",
        keyGateLabel: "Windows Hello Key Gate",
    }),
    ios: buildVerificationProfile({
        method: "ios",
        name: "Face ID / Touch ID",
        shortName: "Face ID / Touch ID",
        reenableTarget: "Face ID / Touch ID",
        deviceLabel: "Face ID / Touch ID (iOS)",
        sectionTitle: "Face ID / Touch ID Unlock",
        enable: "Enable Face ID / Touch ID",
        unlock: "Unlock with Face ID / Touch ID",
        disable: "Disable Face ID / Touch ID",
        keyGateLabel: "Face ID / Touch ID Key Gate",
    }),
    mac: buildVerificationProfile({
        method: "mac",
        name: "Touch ID",
        shortName: "Touch ID",
        reenableTarget: "Touch ID",
        deviceLabel: "Touch ID (macOS)",
        sectionTitle: "Touch ID Unlock",
        enable: "Enable Touch ID",
        unlock: "Unlock with Touch ID",
        disable: "Disable Touch ID Unlock",
        keyGateLabel: "Touch ID Key Gate",
    }),
    android: buildVerificationProfile({
        method: "android",
        name: "Biometric",
        shortName: "Biometric",
        reenableTarget: "biometrics",
        deviceLabel: "Android Biometrics",
        sectionTitle: "Biometric Unlock",
        enable: "Enable Fingerprint / Biometrics",
        unlock: "Unlock with Fingerprint / Biometrics",
        disable: "Disable Biometric Unlock",
        keyGateLabel: "Device Biometric Key Gate",
    }),
    device: buildVerificationProfile({
        method: "device",
        name: "Device verification",
        shortName: "Device Quick Unlock",
        reenableTarget: "Device Quick Unlock",
        deviceLabel: "Platform Authenticator",
        sectionTitle: "Device Quick Unlock",
        enable: "Enable Device Quick Unlock",
        unlock: "Unlock with Device Biometrics / PIN",
        disable: "Disable Device Quick Unlock",
        keyGateLabel: "Device Unlock Key Gate",
    }),
};

/** Detects the active platform verification method from the browser environment. */
export function detectVerificationMethod(): VerificationMethod {
    if (typeof navigator === "undefined") return "device";
    const ua = navigator.userAgent || "";
    const touchPoints = navigator.maxTouchPoints || 0;
    if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && touchPoints > 1)) return "ios";
    if (/Android/i.test(ua)) return "android";
    if (/Windows/i.test(ua)) return "windows";
    if (/Mac/i.test(ua)) return "mac";
    return "device";
}

function resolveVerificationMethod(
    record?: Pick<StoredBiometricRecord, "method" | "deviceLabel"> | null
): VerificationMethod {
    if (record?.method && record.method in VERIFICATION_PROFILES) {
        return record.method;
    }
    const label = record?.deviceLabel || "";
    if (/Windows Hello/i.test(label)) return "windows";
    if (/Face ID|iOS/i.test(label)) return "ios";
    if (/Touch ID/i.test(label)) return "mac";
    if (/Android/i.test(label)) return "android";
    return detectVerificationMethod();
}

export function getVerificationProfile(method?: VerificationMethod): VerificationProfile {
    return VERIFICATION_PROFILES[method ?? detectVerificationMethod()];
}

export function getBiometricButtonLabels(method?: VerificationMethod): VerificationProfile {
    return getVerificationProfile(method);
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
    const cached = cachedRecords.get(uid);
    if (cached) return cached;
    const db = await openDb();
    try {
        const record = await new Promise<StoredBiometricRecord | null>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(uid);
            req.onsuccess = () => resolve((req.result as StoredBiometricRecord) || null);
            req.onerror = () => reject(req.error || new Error("Failed to read verification record."));
        });
        if (record) cachedRecords.set(uid, record);
        return record;
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
            let req: IDBRequest;
            try {
                req = store.put(record);
            } catch (err) {
                reject(err);
                return;
            }
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error || new Error("Failed to save verification record."));
        });
        cachedRecords.set(record.uid, record);
    } catch (err) {
        const errName = (err as { name?: string } | null)?.name;
        if (errName === "DataCloneError") {
            throw new Error("This browser session does not support saving hardware verification keys (try exiting Private Browsing).");
        }
        throw err instanceof Error ? err : new Error("Failed to save verification record.");
    } finally {
        db.close();
    }
}

async function deleteRecord(uid: string): Promise<void> {
    cachedRecords.delete(uid);
    if (typeof indexedDB === "undefined") return;
    const db = await openDb();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.delete(uid);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error || new Error("Failed to remove verification record."));
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

function mapWebAuthnError(err: unknown, fallback: string, method?: VerificationMethod): Error {
    const errors = getVerificationProfile(method).errors;
    const errName = (err as { name?: string } | null)?.name;
    const mappedByDomName: Record<string, string> = {
        NotAllowedError: errors.cancelled,
        AbortError: errors.cancelled,
        NotSupportedError: errors.unsupported,
        ConstraintError: errors.unsupported,
        SecurityError: errors.httpsRequired,
        InvalidStateError: errors.invalidState,
        UnknownError: errors.failed,
    };
    if (errName && errName in mappedByDomName) {
        return new Error(mappedByDomName[errName]);
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
 * Checks whether platform quick unlock is available and enrolled for the given user on this device.
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
 * Returns the enrolled verification method for the given user on this device, if enrolled.
 */
export async function getEnrolledVerificationMethod(uid: string): Promise<VerificationMethod | null> {
    if (!uid) return null;
    try {
        const supported = await isBiometricSupported();
        if (!supported) return null;
        const record = await getRecord(uid);
        if (!record || !record.credentialId || !record.wrappedMasterKey) {
            return null;
        }
        return resolveVerificationMethod(record);
    } catch {
        return null;
    }
}

/**
 * Returns full platform unlock status for displaying in SettingsPage.
 */
export async function getBiometricStatus(uid: string): Promise<BiometricStatus> {
    const detectedMethod = detectVerificationMethod();
    const supported = await isBiometricSupported();
    if (!supported || !uid) {
        return { supported, enabled: false, method: detectedMethod };
    }
    try {
        const record = await getRecord(uid);
        if (!record) {
            return { supported: true, enabled: false, method: detectedMethod };
        }
        return {
            supported: true,
            enabled: true,
            method: resolveVerificationMethod(record),
            mode: record.mode,
            enabledAt: record.enabledAt,
            deviceLabel: record.deviceLabel,
        };
    } catch {
        return { supported, enabled: false, method: detectedMethod };
    }
}

/**
 * Enrolls platform verification (Fingerprint / Face ID / Touch ID / Windows Hello) for this device
 * and stores the wrapped master key locally in IndexedDB.
 */
export async function enrollBiometricUnlock(
    uid: string,
    email: string,
    masterKey: CryptoKey
): Promise<{ mode: BiometricMode; deviceLabel: string; method: VerificationMethod }> {
    const profile = getVerificationProfile();
    const { method, deviceLabel, errors } = profile;
    if (!hasWebAuthnApi()) {
        throw new Error(errors.unsupported);
    }

    const masterKeyHex = await exportKeyToHex(masterKey);
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const prfSalt = crypto.getRandomValues(new Uint8Array(32));
    const userBytes = new TextEncoder().encode(uid);
    const userIdBuf = new Uint8Array(userBytes).buffer;

    const baseCreationOptions: PublicKeyCredentialCreationOptions = {
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
        },
        timeout: 60000,
        attestation: "none",
    };

    const creationOptionsWithPrf: PublicKeyCredentialCreationOptions = {
        ...baseCreationOptions,
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
            publicKey: creationOptionsWithPrf,
        })) as PublicKeyCredential | null;
    } catch (err) {
        const errName = (err as { name?: string } | null)?.name;
        const shouldRetryWithoutExtensions =
            err instanceof TypeError ||
            errName === "TypeError" ||
            errName === "NotSupportedError";
        if (shouldRetryWithoutExtensions) {
            try {
                credential = (await navigator.credentials.create({
                    publicKey: baseCreationOptions,
                })) as PublicKeyCredential | null;
            } catch (retryErr) {
                throw mapWebAuthnError(retryErr, errors.registerFailed, method);
            }
        } else {
            throw mapWebAuthnError(err, errors.registerFailed, method);
        }
    }

    if (!credential) {
        throw new Error(errors.noCredential);
    }

    const attestationResponse = credential.response as AuthenticatorAttestationResponse;
    const rawTransports =
        typeof attestationResponse?.getTransports === "function"
            ? attestationResponse.getTransports()
            : [];
    const transports: AuthenticatorTransport[] =
        rawTransports.length > 0 ? (rawTransports as AuthenticatorTransport[]) : ["internal"];

    const extResults = (credential.getClientExtensionResults?.() || {}) as {
        prf?: PrfExtensionResult;
    };

    let prfSecretBuf: ArrayBuffer | null = null;
    if (extResults.prf?.results?.first) {
        prfSecretBuf = toArrayBuffer(extResults.prf.results.first);
    } else if (extResults.prf?.enabled && method !== "ios" && method !== "mac") {
        // On non-Apple browsers that evaluate PRF only on get(), probe cleanly and fall back if rejected.
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
                            transports,
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
        } catch {
            prfSecretBuf = null;
        }
    }

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedMasterKey = new TextEncoder().encode(masterKeyHex);
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
            method,
            transports,
            prfSalt: toBase64Url(prfSalt),
            iv: toBase64Url(iv),
            wrappedMasterKey: toBase64Url(ciphertext),
            enabledAt: Date.now(),
            deviceLabel,
        });

        return { mode: "prf", deviceLabel, method };
    }

    // Fallback for browsers without immediate WebAuthn PRF output (including Safari / Apple Touch ID / Face ID):
    // non-extractable Web Crypto wrapping key protected by the device verification prompt.
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
        method,
        transports,
        wrappingKey,
        iv: toBase64Url(iv),
        wrappedMasterKey: toBase64Url(ciphertext),
        enabledAt: Date.now(),
        deviceLabel,
    });

    return { mode: "non-extractable", deviceLabel, method };
}

/**
 * Triggers the device verification prompt and unwraps the stored Master Key hex and method.
 * Uses cached WebAuthn/IDB metadata synchronously when warm so Safari preserves transient user activation.
 */
export async function unwrapMasterKeyWithBiometricsResult(
    uid: string
): Promise<{ masterKeyHex: string; method: VerificationMethod }> {
    if (!uid) {
        throw new Error("No authenticated user found.");
    }
    const detectedProfile = getVerificationProfile();
    if (!hasWebAuthnApi()) {
        throw new Error(detectedProfile.errors.unsupported);
    }

    const record = cachedRecords.get(uid) ?? (await getRecord(uid));
    if (!record) {
        throw new Error(detectedProfile.errors.notEnabled);
    }

    const method = resolveVerificationMethod(record);
    const { errors } = getVerificationProfile(method);

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const allowCred: PublicKeyCredentialDescriptor = {
        id: fromBase64Url(record.credentialId),
        type: "public-key",
    };
    const transports =
        record.transports && record.transports.length > 0
            ? record.transports
            : method === "ios" || method === "mac"
                ? (["internal"] as AuthenticatorTransport[])
                : undefined;
    if (transports) {
        allowCred.transports = transports;
    }

    const requestOptions: PublicKeyCredentialRequestOptions = {
        challenge: challenge.buffer,
        rpId: window.location.hostname,
        allowCredentials: [allowCred],
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
        throw mapWebAuthnError(err, errors.failed, method);
    }

    if (!assertion) {
        throw new Error(errors.failed);
    }

    let unwrappingKey: CryptoKey;
    if (record.mode === "prf") {
        const extResults = (assertion.getClientExtensionResults?.() || {}) as {
            prf?: PrfExtensionResult;
        };
        const first = extResults.prf?.results?.first;
        if (!first) {
            throw new Error(errors.noHardwareKey);
        }
        unwrappingKey = await derivePrfAesKey(toArrayBuffer(first));
    } else {
        if (!record.wrappingKey) {
            throw new Error(errors.missingWrappingKey);
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
        throw new Error(errors.decryptFailed);
    }

    const masterKeyHex = new TextDecoder().decode(plaintextBuf);
    if (!/^[0-9a-f]{64}$/i.test(masterKeyHex)) {
        throw new Error("Unwrapped vault key is invalid.");
    }

    return { masterKeyHex, method };
}

/**
 * Triggers the device verification prompt and unwraps the stored Master Key hex.
 */
export async function unwrapMasterKeyWithBiometrics(uid: string): Promise<string> {
    const res = await unwrapMasterKeyWithBiometricsResult(uid);
    return res.masterKeyHex;
}

/**
 * Removes stored biometric enrollment for the given user on this device.
 */
export async function disableBiometricUnlock(uid: string): Promise<void> {
    if (!uid) return;
    await deleteRecord(uid);
}
