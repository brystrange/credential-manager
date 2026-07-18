import {
    collection,
    addDoc,
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
import { encryptPassword, decryptPassword } from "./crypto";

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
export async function tryDecrypt(value: string | undefined, key: CryptoKey): Promise<string> {
    if (!value) return "";
    try {
        // Our encryption format is "ivHex:ciphertextHex". IV is 12 bytes = 24 hex characters.
        if (value.includes(":") && value.split(":")[0].length === 24) {
            return await decryptPassword(value, key);
        }
        return value;
    } catch {
        return value;
    }
}

// Helper to encrypt conditionally based on presence
export async function tryEncrypt(value: string | undefined, key: CryptoKey): Promise<string> {
    if (!value) return "";
    return await encryptPassword(value, key);
}

export function subscribeToCredentials(callback: (credentials: Credential[]) => void): () => void {
    const key = getEncryptionKey();
    if (!key) return () => {};

    const q = query(getUserCredentialsRef(), orderBy("updatedAt", "desc"));
    return onSnapshot(q, async (snapshot) => {
        const credentials: Credential[] = [];
        for (const docSnap of snapshot.docs) {
            const data = docSnap.data();
            let decryptedPassword = "";
            try {
                decryptedPassword = await decryptPassword(data.password, key);
            } catch {
                decryptedPassword = "[decryption failed]";
            }
            
            const decryptedPin = await tryDecrypt(data.pin, key);
            const decryptedEmail = await tryDecrypt(data.email, key);
            const decryptedUsername = await tryDecrypt(data.username, key);
            const decryptedAccountName = await tryDecrypt(data.accountName, key);
            const decryptedComment = await tryDecrypt(data.comment, key);

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
        callback(credentials);
    }, (error) => {
        console.error("Credentials subscription error:", error);
    });
}

export async function addCredential(input: CredentialInput): Promise<string> {
    const key = getEncryptionKey();
    
    // Encrypt fields
    const encryptedPw = await tryEncrypt(input.password, key);
    const encryptedPin = await tryEncrypt(input.pin, key);
    const encryptedEmail = await tryEncrypt(input.email, key);
    const encryptedUsername = await tryEncrypt(input.username, key);
    const encryptedAccountName = await tryEncrypt(input.accountName, key);
    const encryptedComment = await tryEncrypt(input.comment, key);

    const now = Timestamp.now();

    const credRef = await addDoc(getUserCredentialsRef(), {
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
    const key = getEncryptionKey();
    
    // Encrypt fields
    const encryptedPw = await tryEncrypt(input.password, key);
    const encryptedPin = await tryEncrypt(input.pin, key);
    const encryptedEmail = await tryEncrypt(input.email, key);
    const encryptedUsername = await tryEncrypt(input.username, key);
    const encryptedAccountName = await tryEncrypt(input.accountName, key);
    const encryptedComment = await tryEncrypt(input.comment, key);
    
    const now = Timestamp.now();

    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

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
            decryptedPassword = await decryptPassword(data.password, key);
        } catch {
            decryptedPassword = "[decryption failed]";
        }
        
        const decryptedPin = await tryDecrypt(data.pin, key);
        const decryptedEmail = await tryDecrypt(data.email, key);
        const decryptedUsername = await tryDecrypt(data.username, key);
        const decryptedAccountName = await tryDecrypt(data.accountName, key);
        const decryptedComment = await tryDecrypt(data.comment, key);
        
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

    const q = query(getUserCredentialsRef());
    const snapshot = await getDocs(q);

    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        if (data.email && (!data.email.includes(":") || data.email.split(":")[0].length !== 24)) return true;
        if (data.username && (!data.username.includes(":") || data.username.split(":")[0].length !== 24)) return true;
        if (data.pin && (!data.pin.includes(":") || data.pin.split(":")[0].length !== 24)) return true;
        if (data.accountName && (!data.accountName.includes(":") || data.accountName.split(":")[0].length !== 24)) return true;
        if (data.comment && (!data.comment.includes(":") || data.comment.split(":")[0].length !== 24)) return true;
    }
    return false;
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
            (data.email && (!data.email.includes(":") || data.email.split(":")[0].length !== 24)) ||
            (data.username && (!data.username.includes(":") || data.username.split(":")[0].length !== 24)) ||
            (data.pin && (!data.pin.includes(":") || data.pin.split(":")[0].length !== 24)) ||
            (data.accountName && (!data.accountName.includes(":") || data.accountName.split(":")[0].length !== 24)) ||
            (data.comment && (!data.comment.includes(":") || data.comment.split(":")[0].length !== 24));
            
        if (isLegacy) {
            let decryptedPassword = "";
            try {
                decryptedPassword = await decryptPassword(data.password, key);
            } catch {
                decryptedPassword = "[decryption failed]";
            }
            
            const decryptedEmail = await tryDecrypt(data.email, key);
            const decryptedUsername = await tryDecrypt(data.username, key);
            const decryptedPin = await tryDecrypt(data.pin, key);
            const decryptedAccountName = await tryDecrypt(data.accountName, key);
            const decryptedComment = await tryDecrypt(data.comment, key);

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
    
    return migratedCount;
}
