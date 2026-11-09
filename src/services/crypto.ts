// AES-GCM encryption using Web Crypto API with PBKDF2-derived keys

const PBKDF2_ITERATIONS = 100000;

function hexToBuffer(hex: string): ArrayBuffer {
    if (!hex || typeof hex !== "string" || hex.length % 2 !== 0) {
        throw new Error("Invalid hexadecimal string: length must be an even non-empty number.");
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        const byte = parseInt(hex.substring(i, i + 2), 16);
        if (Number.isNaN(byte)) {
            throw new Error(`Invalid hexadecimal byte at index ${i}: '${hex.substring(i, i + 2)}'`);
        }
        bytes[i / 2] = byte;
    }
    return bytes.buffer;
}

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export function generateSalt(): string {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return bufferToHex(salt.buffer);
}

export function generateRecoveryKey(): string {
    const random = crypto.getRandomValues(new Uint8Array(16));
    return bufferToHex(random.buffer);
}

export async function generateMasterKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true, // extractable
        ["encrypt", "decrypt"]
    );
}

export async function exportKeyToHex(key: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey("raw", key);
    return bufferToHex(raw);
}

export async function importKeyFromHex(hex: string): Promise<CryptoKey> {
    const raw = hexToBuffer(hex);
    return await crypto.subtle.importKey(
        "raw",
        raw,
        { name: "AES-GCM" },
        true, // extractable
        ["encrypt", "decrypt"]
    );
}

export async function deriveKey(
    password: string,
    saltHex: string
): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: new Uint8Array(hexToBuffer(saltHex)),
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function encryptPassword(
    plaintext: string,
    key: CryptoKey
): Promise<string> {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoder.encode(plaintext)
    );

    // Format: iv_hex:ciphertext_hex
    return `${bufferToHex(iv.buffer)}:${bufferToHex(ciphertext)}`;
}

export async function decryptPassword(
    encrypted: string,
    key: CryptoKey
): Promise<string> {
    if (!encrypted || typeof encrypted !== "string") {
        throw new Error("Invalid encrypted payload: string expected.");
    }
    const colonIndex = encrypted.indexOf(":");
    if (colonIndex === -1) {
        throw new Error("Malformed ciphertext: missing IV separator ':'.");
    }
    const ivHex = encrypted.slice(0, colonIndex);
    const ciphertextHex = encrypted.slice(colonIndex + 1);
    if (ivHex.length !== 24) {
        throw new Error(`Malformed IV: expected 24 hex characters (12 bytes), received ${ivHex.length}.`);
    }
    if (ciphertextHex.length < 32) {
        throw new Error("Malformed ciphertext: payload too short for AES-GCM.");
    }
    const iv = new Uint8Array(hexToBuffer(ivHex));
    const ciphertext = new Uint8Array(hexToBuffer(ciphertextHex));

    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(plaintext);
}

export async function encryptFile(
    fileBuffer: ArrayBuffer,
    key: CryptoKey
): Promise<Blob> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        fileBuffer
    );
    // Prepend the 12-byte IV to the ciphertext
    return new Blob([iv, ciphertext], { type: "application/octet-stream" });
}

export async function decryptFile(
    encryptedBlob: Blob,
    key: CryptoKey,
    mimeType: string = "application/octet-stream"
): Promise<Blob> {
    if (!encryptedBlob || !(encryptedBlob instanceof Blob)) {
        throw new Error("Invalid file blob provided for decryption.");
    }
    const buffer = await encryptedBlob.arrayBuffer();
    if (buffer.byteLength < 28) {
        throw new Error("Ciphertext file is corrupted or too small for AES-GCM (minimum 28 bytes).");
    }
    // Extract the 12-byte IV from the beginning
    const iv = buffer.slice(0, 12);
    const ciphertext = buffer.slice(12);

    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        key,
        ciphertext
    );

    return new Blob([plaintext], { type: mimeType });
}

// ─── File sharing (asymmetric key wrapping) ─────────────────────────────────
// Each user has an RSA-OAEP key pair. The private key is stored encrypted with
// the user's master key; the public key is used by senders to wrap a random
// per-share AES key so only the intended recipients can decrypt shared files.

const RSA_PARAMS: RsaHashedKeyGenParams = {
    name: "RSA-OAEP",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
};

export async function generateSharingKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(RSA_PARAMS, true, ["encrypt", "decrypt"]);
}

export async function exportPublicKeyJwk(key: CryptoKey): Promise<string> {
    const jwk = await crypto.subtle.exportKey("jwk", key);
    return JSON.stringify({ kty: jwk.kty, n: jwk.n, e: jwk.e, alg: jwk.alg, ext: true });
}

export async function importPublicKeyJwk(jwkString: string): Promise<CryptoKey> {
    const jwk = JSON.parse(jwkString) as JsonWebKey;
    return await crypto.subtle.importKey(
        "jwk",
        { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RSA-OAEP-256", ext: true },
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
    );
}

export async function exportPrivateKeyHex(key: CryptoKey): Promise<string> {
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", key);
    return bufferToHex(pkcs8);
}

export async function importPrivateKeyHex(hex: string): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        "pkcs8",
        hexToBuffer(hex),
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["decrypt"]
    );
}

/** Random AES-256-GCM key used to encrypt the contents of a single share. */
export async function generateShareKey(): Promise<CryptoKey> {
    return await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

/** Encrypts the raw share key with a recipient's RSA public key. Returns hex. */
export async function wrapShareKey(shareKey: CryptoKey, publicKey: CryptoKey): Promise<string> {
    const raw = await crypto.subtle.exportKey("raw", shareKey);
    const wrapped = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, raw);
    return bufferToHex(wrapped);
}

/** Decrypts a wrapped share key with the current user's RSA private key. */
export async function unwrapShareKey(wrappedHex: string, privateKey: CryptoKey): Promise<CryptoKey> {
    const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, hexToBuffer(wrappedHex));
    return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
