// AES-GCM encryption using Web Crypto API with PBKDF2-derived keys

export const PBKDF2_ITERATIONS = 100000;
export const RECOMMENDED_PBKDF2_ITERATIONS = 600000;

const FILE_MAGIC = new Uint8Array([0x46, 0x53, 0x45, 0x4e, 0x43, 0x31, 0x01, 0x00]); // "FSENC1\x01\x00"
const FILE_HEADER_SIZE = 16;
const FILE_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MiB chunks to bound browser memory on multi-GB files
const AAD_VERSION_TAG = "aad1";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeUtf8Buffer(str: string): ArrayBuffer {
    const bytes = textEncoder.encode(str);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function buildChunkAad(
    chunkIndex: number,
    totalChunks: number,
    isFinal: boolean,
    extraAad?: string
): ArrayBuffer {
    const extraBytes = extraAad ? textEncoder.encode(extraAad) : new Uint8Array(0);
    const aad = new Uint8Array(9 + extraBytes.byteLength);
    const view = new DataView(aad.buffer);
    view.setUint32(0, chunkIndex, false);
    view.setUint32(4, totalChunks, false);
    aad[8] = isFinal ? 1 : 0;
    if (extraBytes.byteLength > 0) {
        aad.set(extraBytes, 9);
    }
    return aad.buffer;
}

function hasChunkedMagic(headerBytes: Uint8Array): boolean {
    if (headerBytes.byteLength < FILE_HEADER_SIZE) return false;
    for (let i = 0; i < FILE_MAGIC.length; i++) {
        if (headerBytes[i] !== FILE_MAGIC[i]) return false;
    }
    return true;
}

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

export function isEncryptedPayload(value: unknown): value is string {
    if (typeof value !== "string") return false;
    const parts = value.split(":");
    if (parts.length !== 2 && !(parts.length === 3 && parts[2] === AAD_VERSION_TAG)) {
        return false;
    }
    return parts[0].length === 24 && /^[0-9a-f]+$/i.test(parts[0]) && parts[1].length >= 32;
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
    saltHex: string,
    iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        textEncoder.encode(password),
        "PBKDF2",
        false,
        ["deriveKey"]
    );

    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: new Uint8Array(hexToBuffer(saltHex)),
            iterations,
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
    key: CryptoKey,
    aad?: string
): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const params: AesGcmParams = aad
        ? { name: "AES-GCM", iv, additionalData: encodeUtf8Buffer(aad) }
        : { name: "AES-GCM", iv };
    const ciphertext = await crypto.subtle.encrypt(
        params,
        key,
        textEncoder.encode(plaintext)
    );

    // Format: iv_hex:ciphertext_hex (legacy) or iv_hex:ciphertext_hex:aad1 (context-bound)
    const base = `${bufferToHex(iv.buffer)}:${bufferToHex(ciphertext)}`;
    return aad ? `${base}:${AAD_VERSION_TAG}` : base;
}

export async function decryptPassword(
    encrypted: string,
    key: CryptoKey,
    expectedAad?: string
): Promise<string> {
    if (!encrypted || typeof encrypted !== "string") {
        throw new Error("Invalid encrypted payload: string expected.");
    }
    const parts = encrypted.split(":");
    if (parts.length < 2 || parts.length > 3) {
        throw new Error("Malformed ciphertext: invalid segment structure.");
    }
    const [ivHex, ciphertextHex, versionTag] = parts;
    if (parts.length === 3 && versionTag !== AAD_VERSION_TAG) {
        throw new Error("Unsupported ciphertext format version.");
    }
    if (ivHex.length !== 24) {
        throw new Error(`Malformed IV: expected 24 hex characters (12 bytes), received ${ivHex.length}.`);
    }
    if (ciphertextHex.length < 32) {
        throw new Error("Malformed ciphertext: payload too short for AES-GCM.");
    }
    const hasAad = parts.length === 3;
    if (hasAad && !expectedAad) {
        throw new Error("Missing authentication context for AAD-protected payload.");
    }

    const iv = new Uint8Array(hexToBuffer(ivHex));
    const ciphertext = new Uint8Array(hexToBuffer(ciphertextHex));
    const params: AesGcmParams = hasAad
        ? { name: "AES-GCM", iv, additionalData: encodeUtf8Buffer(expectedAad!) }
        : { name: "AES-GCM", iv };

    const plaintext = await crypto.subtle.decrypt(
        params,
        key,
        ciphertext
    );

    return textDecoder.decode(plaintext);
}

/**
 * Encrypts a File/Blob or ArrayBuffer using authenticated 4 MiB AES-256-GCM chunks ("FSENC1").
 * Chunk order, count, completion flag, and optional context AAD are bound into every chunk tag
 * to bound browser RAM usage and prevent reordering/truncation/swapping.
 */
export async function encryptFile(
    fileInput: ArrayBuffer | Blob,
    key: CryptoKey,
    aad?: string
): Promise<Blob> {
    const isBlob = fileInput instanceof Blob;
    const totalSize = isBlob ? fileInput.size : fileInput.byteLength;
    const totalChunks = totalSize === 0 ? 1 : Math.ceil(totalSize / FILE_CHUNK_SIZE);

    const header = new Uint8Array(FILE_HEADER_SIZE);
    header.set(FILE_MAGIC, 0);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(8, FILE_CHUNK_SIZE, false);
    headerView.setUint32(12, totalChunks, false);

    const parts: BlobPart[] = [header];

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * FILE_CHUNK_SIZE;
        const end = Math.min(totalSize, start + FILE_CHUNK_SIZE);
        const chunkBuffer = isBlob
            ? await fileInput.slice(start, end).arrayBuffer()
            : fileInput.slice(start, end);

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const chunkAad = buildChunkAad(chunkIndex, totalChunks, chunkIndex === totalChunks - 1, aad);
        const ciphertext = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv, additionalData: chunkAad },
            key,
            chunkBuffer
        );

        const lenHeader = new Uint8Array(4);
        new DataView(lenHeader.buffer).setUint32(0, ciphertext.byteLength, false);
        parts.push(lenHeader, iv, new Uint8Array(ciphertext));
    }

    return new Blob(parts, { type: "application/octet-stream" });
}

/**
 * Decrypts both chunked "FSENC1" blobs and legacy single-shot [12-byte IV][ciphertext] blobs.
 */
export async function decryptFile(
    encryptedBlob: Blob,
    key: CryptoKey,
    mimeType: string = "application/octet-stream",
    expectedAad?: string
): Promise<Blob> {
    if (!encryptedBlob || !(encryptedBlob instanceof Blob)) {
        throw new Error("Invalid file blob provided for decryption.");
    }
    if (encryptedBlob.size < 28) {
        throw new Error("Ciphertext file is corrupted or too small for AES-GCM (minimum 28 bytes).");
    }

    const headerBytes = new Uint8Array(await encryptedBlob.slice(0, FILE_HEADER_SIZE).arrayBuffer());
    if (hasChunkedMagic(headerBytes)) {
        const headerView = new DataView(headerBytes.buffer);
        const chunkSize = headerView.getUint32(8, false);
        const totalChunks = headerView.getUint32(12, false);

        if (chunkSize > 0 && totalChunks > 0 && encryptedBlob.size >= FILE_HEADER_SIZE + totalChunks * (4 + 12 + 16)) {
            const decryptedParts: BlobPart[] = [];
            let offset = FILE_HEADER_SIZE;

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                if (offset + 4 + 12 + 16 > encryptedBlob.size) {
                    throw new Error("Ciphertext file is truncated.");
                }
                const lenView = new DataView(await encryptedBlob.slice(offset, offset + 4).arrayBuffer());
                const cipherLen = lenView.getUint32(0, false);
                offset += 4;

                if (cipherLen < 16 || cipherLen > chunkSize + 16 || offset + 12 + cipherLen > encryptedBlob.size) {
                    throw new Error("Ciphertext chunk header is invalid or corrupted.");
                }

                const iv = new Uint8Array(await encryptedBlob.slice(offset, offset + 12).arrayBuffer());
                offset += 12;

                const ciphertext = await encryptedBlob.slice(offset, offset + cipherLen).arrayBuffer();
                offset += cipherLen;

                const chunkAad = buildChunkAad(
                    chunkIndex,
                    totalChunks,
                    chunkIndex === totalChunks - 1,
                    expectedAad
                );
                const plaintext = await crypto.subtle.decrypt(
                    { name: "AES-GCM", iv, additionalData: chunkAad },
                    key,
                    ciphertext
                );
                decryptedParts.push(new Blob([plaintext]));
            }

            if (offset !== encryptedBlob.size) {
                throw new Error("Ciphertext file contains unexpected trailing bytes.");
            }
            return new Blob(decryptedParts, { type: mimeType });
        }
    }

    // Legacy single-shot format: [12-byte IV][ciphertext+tag]
    const buffer = await encryptedBlob.arrayBuffer();
    const iv = buffer.slice(0, 12);
    const ciphertext = buffer.slice(12);

    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        key,
        ciphertext
    );

    return new Blob([plaintext], { type: mimeType });
}

// ??? File sharing (asymmetric key wrapping) ?????????????????????????????????
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
