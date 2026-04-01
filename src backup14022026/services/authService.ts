import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { generateSalt, deriveKey } from "./crypto";

export type AuthUser = User;

let encryptionKey: CryptoKey | null = null;

export function getEncryptionKey(): CryptoKey {
    if (!encryptionKey) throw new Error("Encryption key not available. Please sign in.");
    return encryptionKey;
}

export async function signUp(email: string, password: string, fullName: string): Promise<void> {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // Set display name
    await updateProfile(userCredential.user, { displayName: fullName });

    const salt = generateSalt();
    await setDoc(doc(db, "users", uid), {
        salt,
        fullName,
        createdAt: new Date(),
    });

    encryptionKey = await deriveKey(password, salt);
}

export async function signIn(email: string, password: string): Promise<void> {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const salt = userDoc.data().salt as string;
    encryptionKey = await deriveKey(password, salt);
}

/**
 * Google sign-in (existing users only, no sign-up).
 * The user must already have an account with a salt in Firestore.
 * After Google auth, we prompt for their vault password to derive the encryption key.
 */
export async function signInWithGoogle(): Promise<{ needsPassword: true; uid: string } | { needsPassword: false }> {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const uid = result.user.uid;

    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) {
        // No account exists — sign out and reject
        await firebaseSignOut(auth);
        throw new Error("No Fort Knox account found for this Google account. Please sign up with email first.");
    }

    // Account exists — we need the vault password to derive the key
    return { needsPassword: true, uid };
}

/**
 * After Google sign-in, user provides their vault password to unlock encryption.
 */
export async function unlockVaultWithPassword(password: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const salt = userDoc.data().salt as string;
    encryptionKey = await deriveKey(password, salt);
}

export async function signOutUser(): Promise<void> {
    await firebaseSignOut(auth);
    encryptionKey = null;
}

export function onAuthChange(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
}

export function clearEncryptionKey() {
    encryptionKey = null;
}

export function hasEncryptionKey(): boolean {
    return encryptionKey !== null;
}
