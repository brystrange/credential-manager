// AES-GCM encryption using Web Crypto API with PBKDF2-derived keys

const PBKDF2_ITERATIONS = 100000;

function hexToBuffer(hex: string): ArrayBuffer {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
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
    const [ivHex, ciphertextHex] = encrypted.split(":");
    const iv = new Uint8Array(hexToBuffer(ivHex));
    const ciphertext = new Uint8Array(hexToBuffer(ciphertextHex));

    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
    );

    return new TextDecoder().decode(plaintext);
}
