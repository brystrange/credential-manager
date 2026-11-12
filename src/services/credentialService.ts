import {
    collection,
    addDoc,
    setDoc,
    updateDoc,
    doc,
    getDocs,
    query,
    orderBy,
    Timestamp,
    writeBatch,
    onSnapshot,
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { auth } from "../firebaseConfig";
import { getEncryptionKey } from "./authService";
import { encryptPassword, decryptPassword, isEncryptedPayload } from "./crypto";

function credFieldAad(uid: string, credId: string, field: string): string {
    return `fs:v1:cred:${uid}:${credId}:${field}`;
}

export interface Credential {
    id: string;
    platform: string; // Keep platform plaintext as per user choice
    email: string;
    username: string;
    password: string; // decrypted in memory
    pin?: string;
    accountName?: string;
    comment: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface CredentialInput {
    platform: string;
    email: string;
    username: string;
    password: string;
    pin?: string;
    accountName?: string;
    comment: string;
}

export interface HistoryEntry {
    id: string;
    platform: string;
    email: string;
    username: string;
    password: string; // decrypted in memory
    pin?: string;
    accountName?: string;
    comment: string;
    action: "created" | "updated";
    timestamp: Date;
    changes?: string[];
}

function getUserCredentialsRef() {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    return collection(db, "users", uid, "credentials");
}

// Helper function for trying to decrypt metadata fields
export async function tryDecrypt(
    value: string | undefined,
    key: CryptoKey,
    expectedAad?: string
): Promise<string> {
    if (!value) return "";
    try {
        if (isEncryptedPayload(value)) {
            return await decryptPassword(value, key, expectedAad);
        }
        return value;
    } catch {
        return value;
    }
}

// Helper to encrypt conditionally based on presence
export async function tryEncrypt(
    value: string | undefined,
    key: CryptoKey,
    aad?: string
): Promise<string> {
    if (!value) return "";
    return await encryptPassword(value, key, aad);
}

let cachedLegacyCredentials: { uid: string; hasLegacy: boolean } | null = null;
let legacyCheckInFlight: { uid: string; promise: Promise<boolean> } | null = null;

export function clearCredentialServiceCache(): void {
    cachedLegacyCredentials = null;
    legacyCheckInFlight = null;
}

export function subscribeToCredentials(callback: (credentials: Credential[]) => void): () => void {
    const key = getEncryptionKey();
    if (!key) return () => {};
    const uid = auth.currentUser?.uid;
    if (!uid) return () => {};

    const q = query(getUserCredentialsRef(), orderBy("updatedAt", "desc"));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
        const credentials: Credential[] = [];
        let hasLegacy = false;
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (
                !hasLegacy &&
                ((data.email && !isEncryptedPayload(data.email)) ||
                    (data.username && !isEncryptedPayload(data.username)) ||
                    (data.pin && !isEncryptedPayload(data.pin)) ||
                    (data.accountName && !isEncryptedPayload(data.accountName)) ||
                    (data.comment && !isEncryptedPayload(data.comment)))
            ) {
                hasLegacy = true;
            }
            let decryptedPassword = "";
            try {
                decryptedPassword = await decryptPassword(
                    data.password,
                    key,
                    credFieldAad(uid, docSnap.id, "password")
                );
            } catch {
                decryptedPassword = "[decryption failed]";
            }

            const decryptedPin = await tryDecrypt(data.pin, key, credFieldAad(uid, docSnap.id, "pin"));
            const decryptedEmail = await tryDecrypt(data.email, key, credFieldAad(uid, docSnap.id, "email"));
            const decryptedUsername = await tryDecrypt(data.username, key, credFieldAad(uid, docSnap.id, "username"));
            const decryptedAccountName = await tryDecrypt(
                data.accountName,
                key,
                credFieldAad(uid, docSnap.id, "accountName")
            );
            const decryptedComment = await tryDecrypt(data.comment, key, credFieldAad(uid, docSnap.id, "comment"));

            credentials.push({
                id: docSnap.id,
                platform: data.platform,
                email: decryptedEmail,
                username: decryptedUsername,
                password: decryptedPassword,
                pin: decryptedPin,
                accountName: decryptedAccountName,
                comment: decryptedComment,
                createdAt: (data.createdAt as Timestamp).toDate(),
                updatedAt: (data.updatedAt as Timestamp).toDate(),
            });
        }
        cachedLegacyCredentials = { uid, hasLegacy };
        callback(credentials);
    }, (error) => {
        console.error("Credentials subscription error:", error);
    });

    return () => {
        if (cachedLegacyCredentials?.uid === uid) {
            cachedLegacyCredentials = null;
        }
        unsubscribe();
    };
}

export async function addCredential(input: CredentialInput): Promise<string> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    const key = getEncryptionKey();
    const credRef = doc(getUserCredentialsRef());

    // Encrypt fields with credential-scoped AAD
    const encryptedPw = await tryEncrypt(input.password, key, credFieldAad(uid, credRef.id, "password"));
    const encryptedPin = await tryEncrypt(input.pin, key, credFieldAad(uid, credRef.id, "pin"));
    const encryptedEmail = await tryEncrypt(input.email, key, credFieldAad(uid, credRef.id, "email"));
    const encryptedUsername = await tryEncrypt(input.username, key, credFieldAad(uid, credRef.id, "username"));
    const encryptedAccountName = await tryEncrypt(
        input.accountName,
        key,
        credFieldAad(uid, credRef.id, "accountName")
    );
    const encryptedComment = await tryEncrypt(input.comment, key, credFieldAad(uid, credRef.id, "comment"));

    const now = Timestamp.now();

    await setDoc(credRef, {
        platform: input.platform,
        email: encryptedEmail,
        username: encryptedUsername,
        password: encryptedPw,
        pin: encryptedPin,
        accountName: encryptedAccountName,
        comment: encryptedComment,
        createdAt: now,
        updatedAt: now,
    });

    // Add initial history entry
    await addDoc(collection(credRef, "history"), {
        platform: input.platform,
        email: encryptedEmail,
        username: encryptedUsername,
        password: encryptedPw,
        pin: encryptedPin,
        accountName: encryptedAccountName,
        comment: encryptedComment,
        action: "created",
        timestamp: now,
    });

    return credRef.id;
}

export async function updateCredential(
    id: string,
    input: CredentialInput,
    oldCredential: Credential
): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    const key = getEncryptionKey();

    // Encrypt fields with credential-scoped AAD
    const encryptedPw = await tryEncrypt(input.password, key, credFieldAad(uid, id, "password"));
    const encryptedPin = await tryEncrypt(input.pin, key, credFieldAad(uid, id, "pin"));
    const encryptedEmail = await tryEncrypt(input.email, key, credFieldAad(uid, id, "email"));
    const encryptedUsername = await tryEncrypt(input.username, key, credFieldAad(uid, id, "username"));
    const encryptedAccountName = await tryEncrypt(input.accountName, key, credFieldAad(uid, id, "accountName"));
    const encryptedComment = await tryEncrypt(input.comment, key, credFieldAad(uid, id, "comment"));

    const now = Timestamp.now();

    const credDocRef = doc(db, "users", uid, "credentials", id);
    await updateDoc(credDocRef, {
        platform: input.platform,
        email: encryptedEmail,
        username: encryptedUsername,
        password: encryptedPw,
        pin: encryptedPin,
        accountName: encryptedAccountName,
        comment: encryptedComment,
        updatedAt: now,
    });

    // Compute changed fields based on plaintext
    const changes: string[] = [];
    if (oldCredential.platform !== input.platform) changes.push("platform");
    if (oldCredential.email !== input.email) changes.push("email");
    if (oldCredential.username !== input.username) changes.push("username");
    if (oldCredential.password !== input.password) changes.push("password");
    if (oldCredential.pin !== input.pin) changes.push("pin");
    if (oldCredential.accountName !== input.accountName) changes.push("account name");
    if (oldCredential.comment !== input.comment) changes.push("comment");

    await addDoc(collection(credDocRef, "history"), {
        platform: input.platform,
        email: encryptedEmail,
        username: encryptedUsername,
        password: encryptedPw,
        pin: encryptedPin,
        accountName: encryptedAccountName,
        comment: encryptedComment,
        action: "updated",
        timestamp: now,
        changes,
    });
}

export async function deleteCredential(id: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const credDocRef = doc(db, "users", uid, "credentials", id);

    // Delete history subcollection first
    const historyRef = collection(credDocRef, "history");
    const historySnap = await getDocs(historyRef);

    const batch = writeBatch(db);
    historySnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(credDocRef);
    await batch.commit();
}

export async function getHistory(id: string): Promise<HistoryEntry[]> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");
    
    const key = getEncryptionKey();

    const historyRef = collection(
        db,
        "users",
        uid,
        "credentials",
        id,
        "history"
    );
    const q = query(historyRef, orderBy("timestamp", "desc"));
    const snapshot = await getDocs(q);

    return Promise.all(snapshot.docs.map(async (d) => {
        const data = d.data();
        let decryptedPassword = "";
        try {
            decryptedPassword = await decryptPassword(data.password, key, credFieldAad(uid, id, "password"));
        } catch {
            decryptedPassword = "[decryption failed]";
        }

        const decryptedPin = await tryDecrypt(data.pin, key, credFieldAad(uid, id, "pin"));
        const decryptedEmail = await tryDecrypt(data.email, key, credFieldAad(uid, id, "email"));
        const decryptedUsername = await tryDecrypt(data.username, key, credFieldAad(uid, id, "username"));
        const decryptedAccountName = await tryDecrypt(data.accountName, key, credFieldAad(uid, id, "accountName"));
        const decryptedComment = await tryDecrypt(data.comment, key, credFieldAad(uid, id, "comment"));
        
        return {
            id: d.id,
            platform: data.platform,
            email: decryptedEmail,
            username: decryptedUsername,
            password: decryptedPassword,
            pin: decryptedPin,
            accountName: decryptedAccountName,
            comment: decryptedComment,
            action: data.action,
            timestamp: (data.timestamp as Timestamp).toDate(),
            changes: data.changes || [],
        };
    }));
}

export async function hasLegacyCredentials(): Promise<boolean> {
    const uid = auth.currentUser?.uid;
    if (!uid) return false;

    if (cachedLegacyCredentials?.uid === uid) {
        return cachedLegacyCredentials.hasLegacy;
    }

    if (legacyCheckInFlight?.uid === uid) {
        return legacyCheckInFlight.promise;
    }

    const promise = (async () => {
        const q = query(getUserCredentialsRef());
        const snapshot = await getDocs(q);

        let hasLegacy = false;
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            if (
                (data.email && !isEncryptedPayload(data.email)) ||
                (data.username && !isEncryptedPayload(data.username)) ||
                (data.pin && !isEncryptedPayload(data.pin)) ||
                (data.accountName && !isEncryptedPayload(data.accountName)) ||
                (data.comment && !isEncryptedPayload(data.comment))
            ) {
                hasLegacy = true;
                break;
            }
        }
        cachedLegacyCredentials = { uid, hasLegacy };
        return hasLegacy;
    })().finally(() => {
        if (legacyCheckInFlight?.uid === uid) {
            legacyCheckInFlight = null;
        }
    });

    legacyCheckInFlight = { uid, promise };
    return promise;
}

export async function migrateLegacyData(): Promise<number> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const key = getEncryptionKey();
    const q = query(getUserCredentialsRef());
    const snapshot = await getDocs(q);
    
    let migratedCount = 0;
    
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        
        const isLegacy =
            Boolean(data.email && !isEncryptedPayload(data.email)) ||
            Boolean(data.username && !isEncryptedPayload(data.username)) ||
            Boolean(data.pin && !isEncryptedPayload(data.pin)) ||
            Boolean(data.accountName && !isEncryptedPayload(data.accountName)) ||
            Boolean(data.comment && !isEncryptedPayload(data.comment));

        if (isLegacy) {
            let decryptedPassword = "";
            try {
                decryptedPassword = await decryptPassword(
                    data.password,
                    key,
                    credFieldAad(uid, docSnap.id, "password")
                );
            } catch {
                decryptedPassword = "[decryption failed]";
            }

            const decryptedEmail = await tryDecrypt(data.email, key, credFieldAad(uid, docSnap.id, "email"));
            const decryptedUsername = await tryDecrypt(
                data.username,
                key,
                credFieldAad(uid, docSnap.id, "username")
            );
            const decryptedPin = await tryDecrypt(data.pin, key, credFieldAad(uid, docSnap.id, "pin"));
            const decryptedAccountName = await tryDecrypt(
                data.accountName,
                key,
                credFieldAad(uid, docSnap.id, "accountName")
            );
            const decryptedComment = await tryDecrypt(data.comment, key, credFieldAad(uid, docSnap.id, "comment"));

            const input: CredentialInput = {
                platform: data.platform,
                email: decryptedEmail,
                username: decryptedUsername,
                password: decryptedPassword,
                pin: decryptedPin,
                accountName: decryptedAccountName,
                comment: decryptedComment,
            };
            
            await addCredential(input);
            await deleteCredential(docSnap.id);
            migratedCount++;
        }
    }
    
    cachedLegacyCredentials = { uid, hasLegacy: false };
    return migratedCount;
}
