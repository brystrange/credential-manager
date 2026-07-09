import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile,
    sendEmailVerification,
    sendPasswordResetEmail,
    fetchSignInMethodsForEmail,
} from "firebase/auth";
import type { User } from "firebase/auth";

import { doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { 
    generateSalt, 
    deriveKey, 
    decryptPassword, 
    encryptPassword,
    generateMasterKey,
    exportKeyToHex,
    importKeyFromHex,
    generateRecoveryKey
} from "./crypto";

export type AuthUser = User;

export async function resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
}

let encryptionKey: CryptoKey | null = null;
let pendingSyncPassword: string | null = null;

export function getEncryptionKey(): CryptoKey {
    if (!encryptionKey) throw new Error("Encryption key not available. Please sign in.");
    return encryptionKey;
}

export function validatePassword(pw: string): string | null {
    if (pw.length < 8) return "Password must be at least 8 characters.";
    if (!/[a-z]/.test(pw)) return "Password must contain at least one lowercase letter.";
    if (!/[A-Z]/.test(pw)) return "Password must contain at least one uppercase letter.";
    if (!/[0-9]/.test(pw)) return "Password must contain at least one number.";
    if (!/[^a-zA-Z0-9]/.test(pw)) return "Password must contain at least one special character.";
    return null;
}

export async function signUp(email: string, password: string, fullName: string): Promise<string> {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // Set display name
    await updateProfile(userCredential.user, { displayName: fullName });

    const salt = generateSalt();
    const pdk = await deriveKey(password, salt);
    const mk = await generateMasterKey();
    const masterKeyHex = await exportKeyToHex(mk);
    const encryptedMasterKey = await encryptPassword(masterKeyHex, pdk);

    const recoveryKey = generateRecoveryKey();
    const recoveryPdk = await deriveKey(recoveryKey, salt);
    const encryptedMasterKeyRecovery = await encryptPassword(masterKeyHex, recoveryPdk);

    await setDoc(doc(db, "users", uid), {
        salt,
        email,
        fullName,
        createdAt: new Date(),
        encryptedMasterKey,
        encryptedMasterKeyRecovery,
    });

    // Send verification email before allowing vault access
    await sendEmailVerification(userCredential.user);

    // Sign out immediately — user must verify email before logging in
    await firebaseSignOut(auth);
    encryptionKey = null;

    return recoveryKey;
}

export async function signIn(email: string, password: string): Promise<void> {
    let userCredential;
    try {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
        const msg = err.message || "";
        if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password") || msg.includes("auth/user-not-found")) {
            try {
                const methods = await fetchSignInMethodsForEmail(auth, email);
                if (methods.length === 0) {
                    throw new Error("auth/user-not-found");
                } else {
                    throw new Error("auth/wrong-password");
                }
            } catch (e) {
                throw err; // Fallback to original error if fetch fails
            }
        }
        throw err;
    }

    // Block unverified users from accessing the vault
    if (!userCredential.user.emailVerified) {
        await firebaseSignOut(auth);
        throw new Error("auth/email-not-verified");
    }

    const uid = userCredential.user.uid;
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const salt = userDoc.data().salt as string;
    const pdk = await deriveKey(password, salt);
    // signIn already validated the password via Firebase Auth, so escrow recovery is safe.
    try {
        await initializeMasterKey(uid, pdk, userDoc.data(), password);
    } catch (e: any) {
        if (e.message === "Invalid vault password") {
            pendingSyncPassword = password;
        }
        throw e;
    }
}

/**
 * @param rawPassword - The plaintext password for re-authentication verification.
 */
async function initializeMasterKey(
    uid: string,
    pdk: CryptoKey,
    userDocData: any,
    rawPassword?: string
): Promise<void> {
    const encryptedMasterKey = userDocData.encryptedMasterKey;

    if (encryptedMasterKey) {
        try {
            const masterKeyHex = await decryptPassword(encryptedMasterKey, pdk);
            encryptionKey = await importKeyFromHex(masterKeyHex);
        } catch (e) {
            // PDK failed to decrypt the Master Key.
            if (pendingSyncPassword && pendingSyncPassword === rawPassword) {
                 throw new Error("vault-out-of-sync");
            }
            // Strict zero-knowledge means we just throw an error. There is no server backup.
            throw new Error("Invalid vault password");
        }
    } else {
        // MIGRATION: Existing user without a master key
        const mk = await generateMasterKey();
        const masterKeyHex = await exportKeyToHex(mk);

        // Encrypt MK with PDK
        const newEncryptedMasterKey = await encryptPassword(masterKeyHex, pdk);
        await setDoc(doc(db, "users", uid), { encryptedMasterKey: newEncryptedMasterKey }, { merge: true });

        // Re-encrypt all existing credentials (currently encrypted with PDK)
        const credsRef = collection(db, "users", uid, "credentials");
        const credsSnap = await getDocs(credsRef);
        
        for (const credDoc of credsSnap.docs) {
            const data = credDoc.data();
            try {
                const decryptedPass = await decryptPassword(data.password, pdk);
                const reEncryptedPass = await encryptPassword(decryptedPass, mk);
                await setDoc(credDoc.ref, { password: reEncryptedPass }, { merge: true });
            } catch (err) {
                console.error("Migration failed for credential", credDoc.id);
            }
        }

        encryptionKey = mk;
    }
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

export async function setupGoogleVault(password: string): Promise<string> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const salt = generateSalt();
    const pdk = await deriveKey(password, salt);
    
    const mk = await generateMasterKey();
    const masterKeyHex = await exportKeyToHex(mk);
    const encryptedMasterKey = await encryptPassword(masterKeyHex, pdk);

    const recoveryKey = generateRecoveryKey();
    const recoveryPdk = await deriveKey(recoveryKey, salt);
    const encryptedMasterKeyRecovery = await encryptPassword(masterKeyHex, recoveryPdk);
    
    await setDoc(doc(db, "users", uid), {
        salt,
        fullName:
            auth.currentUser?.displayName ||
            auth.currentUser?.email?.split("@")[0] ||
            "User",
        createdAt: new Date(),
        encryptedMasterKey,
        encryptedMasterKeyRecovery,
    });

    encryptionKey = mk;
    return recoveryKey;
}

export async function unlockVaultWithPassword(password: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const salt = userDoc.data().salt as string;
    const pdk = await deriveKey(password, salt);

    // Pass rawPassword so initializeMasterKey can re-authenticate with Firebase
    // if MK decryption fails, to confirm it's a password reset and not a wrong password.
    await initializeMasterKey(uid, pdk, userDoc.data(), password);

    if (pendingSyncPassword && pendingSyncPassword !== password) {
        try {
            const newPdk = await deriveKey(pendingSyncPassword, salt);
            const masterKeyHex = await exportKeyToHex(encryptionKey!);
            const newEncryptedMasterKey = await encryptPassword(masterKeyHex, newPdk);
            await setDoc(doc(db, "users", uid), { encryptedMasterKey: newEncryptedMasterKey }, { merge: true });
        } catch (err) {
            console.error("Failed to auto-sync vault password", err);
        } finally {
            pendingSyncPassword = null;
        }
    }
}

/**
 * Resets the vault password. Requires the user's offline Recovery Key.
 *
 * Flow:
 *   1. Decrypt the `encryptedMasterKeyRecovery` using the Recovery Key.
 *   2. Derive a new PDK from newPassword + the user's existing salt.
 *   3. Re-encrypt the MK with the new PDK and save to Firestore.
 *   4. Set the in-memory encryption key so the vault unlocks immediately.
 */
export async function resetGoogleVaultPassword(newPassword: string, recoveryKey: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const salt = userDoc.data().salt as string;
    const encryptedMasterKeyRecovery = userDoc.data().encryptedMasterKeyRecovery as string;

    if (!encryptedMasterKeyRecovery) {
        throw new Error("No recovery key on file. Vault cannot be recovered.");
    }

    let masterKeyHex: string;
    try {
        // Step 1: Recover the Master Key using the Recovery Key
        const recoveryPdk = await deriveKey(recoveryKey, salt);
        masterKeyHex = await decryptPassword(encryptedMasterKeyRecovery, recoveryPdk);
    } catch (e) {
        throw new Error("Invalid Recovery Key. Please try again.");
    }

    // Step 2: Derive a new PDK from the new password + salt (all local crypto)
    const newPdk = await deriveKey(newPassword, salt);
    const newEncryptedMasterKey = await encryptPassword(masterKeyHex, newPdk);

    // Sync Firebase Auth password if not a Google user
    const isGoogleUser = user.providerData.some((p) => p.providerId === "google.com");
    if (!isGoogleUser) {
        try {
            const { updatePassword } = await import("firebase/auth");
            await updatePassword(user, newPassword);
        } catch (e: any) {
            if (e.code === "auth/requires-recent-login") {
                throw new Error("Please sign out and sign back in before changing your password.");
            }
            throw new Error("Failed to sync login password: " + e.message);
        }
    }

    // Step 3: Save the new encryptedMasterKey to Firestore
    try {
        await setDoc(doc(db, "users", user.uid), { encryptedMasterKey: newEncryptedMasterKey }, { merge: true });
    } catch {
        throw new Error("Unable to save new vault password.");
    }

    // Step 4: Set the in-memory encryption key so the vault unlocks immediately
    encryptionKey = await importKeyFromHex(masterKeyHex);
    pendingSyncPassword = null;
}

/**
 * Changes the vault password while already unlocked.
 * Requires the current password to prove ownership.
 */
export async function changeVaultPassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const salt = userDoc.data().salt as string;
    const encryptedMasterKey = userDoc.data().encryptedMasterKey as string;

    let masterKeyHex: string;
    try {
        const currentPdk = await deriveKey(currentPassword, salt);
        masterKeyHex = await decryptPassword(encryptedMasterKey, currentPdk);
    } catch (e) {
        throw new Error("Incorrect current password.");
    }

    const newPdk = await deriveKey(newPassword, salt);
    const newEncryptedMasterKey = await encryptPassword(masterKeyHex, newPdk);

    // Sync Firebase Auth password if not a Google user
    const isGoogleUser = user.providerData.some((p) => p.providerId === "google.com");
    if (!isGoogleUser) {
        try {
            const { updatePassword } = await import("firebase/auth");
            await updatePassword(user, newPassword);
        } catch (e: any) {
            if (e.code === "auth/requires-recent-login") {
                throw new Error("Please sign out and sign back in before changing your password.");
            }
            throw new Error("Failed to sync login password: " + e.message);
        }
    }

    try {
        await setDoc(doc(db, "users", user.uid), { encryptedMasterKey: newEncryptedMasterKey }, { merge: true });
    } catch {
        throw new Error("Unable to save new vault password.");
    }
}

/**
 * Generates a new Recovery Key for the user.
 * Requires the current vault password to prove ownership.
 */
export async function generateNewRecoveryKey(currentPassword: string): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const salt = userDoc.data().salt as string;
    const encryptedMasterKey = userDoc.data().encryptedMasterKey as string;

    let masterKeyHex: string;
    try {
        const currentPdk = await deriveKey(currentPassword, salt);
        masterKeyHex = await decryptPassword(encryptedMasterKey, currentPdk);
    } catch (e) {
        throw new Error("Incorrect current password.");
    }

    const recoveryKey = generateRecoveryKey();
    const recoveryPdk = await deriveKey(recoveryKey, salt);
    const newEncryptedMasterKeyRecovery = await encryptPassword(masterKeyHex, recoveryPdk);

    try {
        await setDoc(doc(db, "users", user.uid), { encryptedMasterKeyRecovery: newEncryptedMasterKeyRecovery }, { merge: true });
        return recoveryKey;
    } catch {
        throw new Error("Unable to save new recovery key.");
    }
}

export async function signOutUser(): Promise<void> {
    await firebaseSignOut(auth);
    encryptionKey = null;
    pendingSyncPassword = null;
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

export async function checkSecurityTerms(): Promise<boolean> {
    const uid = auth.currentUser?.uid;
    if (!uid) return true;
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return true;
    return userDoc.data().hasAgreedToSecurityTerms === true;
}

export async function agreeSecurityTerms(): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await setDoc(doc(db, "users", uid), { hasAgreedToSecurityTerms: true }, { merge: true });
}