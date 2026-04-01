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
} from "firebase/firestore";
import { db } from "../firebaseConfig";
import { auth } from "../firebaseConfig";
import { getEncryptionKey } from "./authService";
import { encryptPassword, decryptPassword } from "./crypto";

export interface Credential {
    id: string;
    platform: string;
    email: string;
    username: string;
    password: string; // decrypted in memory
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
    accountName?: string;
    comment: string;
}

export interface HistoryEntry {
    id: string;
    platform: string;
    email: string;
    username: string;
    password: string; // kept encrypted in history display
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

export async function getCredentials(): Promise<Credential[]> {
    const key = getEncryptionKey();
    const q = query(getUserCredentialsRef(), orderBy("updatedAt", "desc"));
    const snapshot = await getDocs(q);

    const credentials: Credential[] = [];
    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let decryptedPassword = "";
        try {
            decryptedPassword = await decryptPassword(data.password, key);
        } catch {
            decryptedPassword = "[decryption failed]";
        }
        credentials.push({
            id: docSnap.id,
            platform: data.platform,
            email: data.email,
            username: data.username || "",
            password: decryptedPassword,
            accountName: data.accountName || "",
            comment: data.comment || "",
            createdAt: (data.createdAt as Timestamp).toDate(),
            updatedAt: (data.updatedAt as Timestamp).toDate(),
        });
    }
    return credentials;
}

export async function addCredential(input: CredentialInput): Promise<string> {
    const key = getEncryptionKey();
    const encryptedPw = await encryptPassword(input.password, key);
    const now = Timestamp.now();

    const credRef = await addDoc(getUserCredentialsRef(), {
        platform: input.platform,
        email: input.email,
        username: input.username,
        password: encryptedPw,
        accountName: input.accountName || "",
        comment: input.comment,
        createdAt: now,
        updatedAt: now,
    });

    // Add initial history entry
    await addDoc(collection(credRef, "history"), {
        platform: input.platform,
        email: input.email,
        username: input.username,
        password: encryptedPw,
        accountName: input.accountName || "",
        comment: input.comment,
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
    const encryptedPw = await encryptPassword(input.password, key);
    const now = Timestamp.now();

    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const credDocRef = doc(db, "users", uid, "credentials", id);
    await updateDoc(credDocRef, {
        platform: input.platform,
        email: input.email,
        username: input.username,
        password: encryptedPw,
        accountName: input.accountName || "",
        comment: input.comment,
        updatedAt: now,
    });

    // Compute changed fields
    const changes: string[] = [];
    if (oldCredential.platform !== input.platform) changes.push("platform");
    if (oldCredential.email !== input.email) changes.push("email");
    if (oldCredential.username !== input.username) changes.push("username");
    if (oldCredential.password !== input.password) changes.push("password");
    if (oldCredential.accountName !== input.accountName) changes.push("account name");
    if (oldCredential.comment !== input.comment) changes.push("comment");

    await addDoc(collection(credDocRef, "history"), {
        platform: input.platform,
        email: input.email,
        username: input.username,
        password: encryptedPw,
        accountName: input.accountName || "",
        comment: input.comment,
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

    return snapshot.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            platform: data.platform,
            email: data.email,
            username: data.username || "",
            password: "••••••••",
            accountName: data.accountName || "",
            comment: data.comment || "",
            action: data.action,
            timestamp: (data.timestamp as Timestamp).toDate(),
            changes: data.changes || [],
        };
    });
}
