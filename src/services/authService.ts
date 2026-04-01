import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile,
    sendEmailVerification,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { doc, setDoc, getDoc, collection, query, limit, getDocs } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { generateSalt, deriveKey, decryptPassword, encryptPassword } from "./crypto";

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

    // Send verification email before allowing vault access
    await sendEmailVerification(userCredential.user);

    // Sign out immediately — user must verify email before logging in
    await firebaseSignOut(auth);
    encryptionKey = null;
}

export async function signIn(email: string, password: string): Promise<void> {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    // Block unverified users from accessing the vault
    if (!userCredential.user.emailVerified) {
        await firebaseSignOut(auth);
        throw new Error("auth/email-not-verified");
    }

    const uid = userCredential.user.uid;

    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const salt = userDoc.data().salt as string;
    encryptionKey = await deriveKey(password, salt);
}

/**
 * Resend the verification email to the currently signed-in (unverified) user.
 * Signs in temporarily, sends the email, then signs out again.
 */
export async function resendVerificationEmail(email: string, password: string): Promise<void> {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    if (userCredential.user.emailVerified) {
        // Already verified — no need to resend, just sign out cleanly
        await firebaseSignOut(auth);
        return;
    }
    await sendEmailVerification(userCredential.user);
    await firebaseSignOut(auth);
}

/**
 * Google sign-in / sign-up (unified).
 * - If the user has no Firestore record  → status "new"   (needs vault setup)
 * - If the user has an existing record   → status "existing" (needs vault unlock)
 */
export async function signInWithGoogle(): Promise<
    | { status: "new"; uid: string }
    | { status: "existing"; uid: string }
> {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const uid = result.user.uid;

    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) {
        // New user — stay signed in so they can set up their vault
        return { status: "new", uid };
    }

    // Existing user — needs vault password to derive the encryption key
    return { status: "existing", uid };
}

/**
 * Called once after a new Google user sets their vault password.
 * Creates the Firestore user doc, derives the encryption key, and stores a canary.
 */
export async function setupGoogleVault(password: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const salt = generateSalt();
    const derivedKey = await deriveKey(password, salt);
    const canary = await encryptPassword("canary", derivedKey);

    await setDoc(doc(db, "users", uid), {
        salt,
        fullName:
            auth.currentUser?.displayName ||
            auth.currentUser?.email?.split("@")[0] ||
            "User",
        createdAt: new Date(),
        canary,
    });

    encryptionKey = derivedKey;
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
    const derivedKey = await deriveKey(password, salt);

    // VERIFICATION: Try to decrypt a known value to ensure password is correct
    // 1. Check for a canary (future proofing)
    const canary = userDoc.data().canary;
    if (canary) {
        try {
            await decryptPassword(canary, derivedKey);
        } catch (e) {
            throw new Error("Invalid vault password");
        }
    } else {
        // 2. Fallback: Try to decrypt one credential
        const q = query(collection(db, "users", uid, "credentials"), limit(1));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const testDoc = snapshot.docs[0];
            try {
                await decryptPassword(testDoc.data().password, derivedKey);
            } catch (e) {
                throw new Error("Invalid vault password");
            }
        } else {
            // 3. Vault is empty and no canary -> Assume password is correct (first use / reset)
            // CREATE A CANARY NOW so next time we can verify
            const newCanary = await encryptPassword("canary", derivedKey);
            await setDoc(doc(db, "users", uid), { canary: newCanary }, { merge: true });
        }
    }

    encryptionKey = derivedKey;
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