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
    EmailAuthProvider,
    reauthenticateWithCredential,
    fetchSignInMethodsForEmail,
} from "firebase/auth";
import type { User } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebaseConfig";
import { 
    generateSalt, 
    deriveKey, 
    decryptPassword, 
    encryptPassword,
    generateMasterKey,
    exportKeyToHex,
    importKeyFromHex
} from "./crypto";

export type AuthUser = User;

export async function resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
}

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
    const pdk = await deriveKey(password, salt);
    const mk = await generateMasterKey();
    const masterKeyHex = await exportKeyToHex(mk);
    const encryptedMasterKey = await encryptPassword(masterKeyHex, pdk);

    await setDoc(doc(db, "users", uid), {
        salt,
        fullName,
        createdAt: new Date(),
        encryptedMasterKey,
    });

    // Escrow the master key
    try {
        const functions = getFunctions();
        const escrowMasterKeyFn = httpsCallable(functions, 'escrowMasterKey');
        await escrowMasterKeyFn({ masterKey: masterKeyHex });
    } catch (e) {
        console.error("Failed to escrow master key during signup", e);
    }

    // Send verification email before allowing vault access
    await sendEmailVerification(userCredential.user);

    // Sign out immediately — user must verify email before logging in
    await firebaseSignOut(auth);
    encryptionKey = null;
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
    await initializeMasterKey(uid, pdk, userDoc.data(), password, true);
}

/**
 * @param rawPassword - The plaintext password for re-authentication verification.
 * @param passwordVerified - If true, skip Firebase re-auth (caller already verified via signIn).
 */
async function initializeMasterKey(
    uid: string,
    pdk: CryptoKey,
    userDocData: any,
    rawPassword?: string,
    passwordVerified = false
): Promise<void> {
    const encryptedMasterKey = userDocData.encryptedMasterKey;
    const functions = getFunctions();

    if (encryptedMasterKey) {
        try {
            const masterKeyHex = await decryptPassword(encryptedMasterKey, pdk);
            encryptionKey = await importKeyFromHex(masterKeyHex);
        } catch (e) {
            // PDK failed to decrypt the Master Key.
            // This could mean: (a) wrong password, or (b) a Firebase password reset occurred.
            // We MUST verify the password is correct before attempting escrow recovery,
            // otherwise any random password would unlock the vault via escrow.

            const user = auth.currentUser;
            const isEmailUser = user?.providerData.some(p => p.providerId === 'password');

            if (passwordVerified) {
                // Caller already authenticated via Firebase (e.g. signIn flow) — safe to recover.
            } else if (isEmailUser && rawPassword && user?.email) {
                // Re-authenticate against Firebase Auth to confirm this is the user's real password.
                // If Firebase rejects it → wrong password → reject immediately.
                // If Firebase accepts it but MK decryption failed → password was reset → allow escrow recovery.
                try {
                    const credential = EmailAuthProvider.credential(user.email, rawPassword);
                    await reauthenticateWithCredential(user, credential);
                    // Firebase accepted the password — this is a genuine password-reset scenario.
                } catch {
                    throw new Error("Invalid vault password");
                }
            } else {
                // Google user or unknown provider — vault password is independent of Firebase auth.
                // No escrow recovery path here; the password is simply wrong.
                throw new Error("Invalid vault password");
            }

            // Password verified — attempt escrow recovery.
            try {
                const recoverMasterKeyFn = httpsCallable(functions, 'recoverMasterKey');
                const result = await recoverMasterKeyFn();
                const masterKeyHex = (result.data as any).masterKey;

                // Re-encrypt the Master Key with the new PDK and save it.
                const newEncryptedMasterKey = await encryptPassword(masterKeyHex, pdk);
                await setDoc(doc(db, "users", uid), { encryptedMasterKey: newEncryptedMasterKey }, { merge: true });

                encryptionKey = await importKeyFromHex(masterKeyHex);
            } catch (recoverErr) {
                throw new Error("Unable to recover vault. Please contact support.");
            }
        }
    } else {
        // MIGRATION: Existing user without a master key
        const mk = await generateMasterKey();
        const masterKeyHex = await exportKeyToHex(mk);

        // Escrow MK
        try {
            const escrowMasterKeyFn = httpsCallable(functions, 'escrowMasterKey');
            await escrowMasterKeyFn({ masterKey: masterKeyHex });
        } catch (e) {
            console.error("Failed to escrow master key during migration", e);
        }

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

export async function setupGoogleVault(password: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const salt = generateSalt();
    const pdk = await deriveKey(password, salt);
    
    const mk = await generateMasterKey();
    const masterKeyHex = await exportKeyToHex(mk);
    const encryptedMasterKey = await encryptPassword(masterKeyHex, pdk);
    
    try {
        const functions = getFunctions();
        const escrowMasterKeyFn = httpsCallable(functions, 'escrowMasterKey');
        await escrowMasterKeyFn({ masterKey: masterKeyHex });
    } catch (e) {
        console.error("Failed to escrow master key during Google setup", e);
    }

    await setDoc(doc(db, "users", uid), {
        salt,
        fullName:
            auth.currentUser?.displayName ||
            auth.currentUser?.email?.split("@")[0] ||
            "User",
        createdAt: new Date(),
        encryptedMasterKey,
    });

    encryptionKey = mk;
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