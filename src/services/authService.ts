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
    PBKDF2_ITERATIONS,
    RECOMMENDED_PBKDF2_ITERATIONS,
    generateSalt,
    deriveKey,
    decryptPassword,
    encryptPassword,
    generateMasterKey,
    exportKeyToHex,
    importKeyFromHex,
    generateRecoveryKey,
} from "./crypto";
import { clearSharingKeys } from "./shareService";
import {
    enrollBiometricUnlock,
    unwrapMasterKeyWithBiometricsResult,
    disableBiometricUnlock,
    getVerificationProfile,
    type BiometricMode,
    type VerificationMethod,
} from "./biometricService";

export type AuthUser = User;

export async function resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
}

let encryptionKey: CryptoKey | null = null;
let pendingSyncPassword: string | null = null;
let cachedCryptoMeta: { uid: string; salt: string; encryptedMasterKey: string; kdfIterations: number; hasAgreedToSecurityTerms?: boolean } | null = null;

export function resolveKdfIterations(value: unknown): number {
    return typeof value === "number" && Number.isInteger(value) && value >= PBKDF2_ITERATIONS
        ? value
        : PBKDF2_ITERATIONS;
}

export function userFieldAad(uid: string, field: "encryptedMasterKey" | "encryptedMasterKeyRecovery" | "fullName"): string {
    return `fs:v1:user:${uid}:${field}`;
}

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

    const pwErr = validatePassword(password);
    if (pwErr) throw new Error(pwErr);

    // Set display name
    await updateProfile(userCredential.user, { displayName: fullName });

    const salt = generateSalt();
    const kdfIterations = RECOMMENDED_PBKDF2_ITERATIONS;
    const pdk = await deriveKey(password, salt, kdfIterations);
    const mk = await generateMasterKey();
    const masterKeyHex = await exportKeyToHex(mk);
    const encryptedMasterKey = await encryptPassword(masterKeyHex, pdk, userFieldAad(uid, "encryptedMasterKey"));

    const recoveryKey = generateRecoveryKey();
    const recoveryPdk = await deriveKey(recoveryKey, salt, kdfIterations);
    const encryptedMasterKeyRecovery = await encryptPassword(
        masterKeyHex,
        recoveryPdk,
        userFieldAad(uid, "encryptedMasterKeyRecovery")
    );

    const encryptedFullName = await encryptPassword(fullName, mk, userFieldAad(uid, "fullName"));

    await setDoc(doc(db, "users", uid), {
        salt,
        kdfIterations,
        recoveryKdfIterations: kdfIterations,
        // Store normalized email for admin exemption lookup
        email: (auth.currentUser?.email || "").toLowerCase(),
        fullName: encryptedFullName,
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

    const data = userDoc.data();
    const salt = data.salt as string;
    const kdfIterations = resolveKdfIterations(data.kdfIterations);
    const pdk = await deriveKey(password, salt, kdfIterations);
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

    const kdfIterations = resolveKdfIterations(userDocData.kdfIterations);

    if (encryptedMasterKey) {
        try {
            const masterKeyHex = await decryptPassword(
                encryptedMasterKey,
                pdk,
                userFieldAad(uid, "encryptedMasterKey")
            );
            encryptionKey = await importKeyFromHex(masterKeyHex);
            if (typeof userDocData.salt === "string" && userDocData.salt) {
                cachedCryptoMeta = {
                    uid,
                    salt: userDocData.salt,
                    encryptedMasterKey,
                    kdfIterations,
                    hasAgreedToSecurityTerms: userDocData.hasAgreedToSecurityTerms === true,
                };
            }

            // Check if fullName is still plaintext (doesn't contain our iv separator ":")
            if (userDocData.fullName && !userDocData.fullName.includes(":")) {
                const encryptedFullName = await encryptPassword(
                    userDocData.fullName,
                    encryptionKey,
                    userFieldAad(uid, "fullName")
                );
                await setDoc(doc(db, "users", uid), { fullName: encryptedFullName }, { merge: true });
            }
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
        const newEncryptedMasterKey = await encryptPassword(
            masterKeyHex,
            pdk,
            userFieldAad(uid, "encryptedMasterKey")
        );

        const updateData: any = { encryptedMasterKey: newEncryptedMasterKey };
        if (userDocData.fullName && !userDocData.fullName.includes(":")) {
            updateData.fullName = await encryptPassword(
                userDocData.fullName,
                mk,
                userFieldAad(uid, "fullName")
            );
        }

        await setDoc(doc(db, "users", uid), updateData, { merge: true });
        if (typeof userDocData.salt === "string" && userDocData.salt) {
            cachedCryptoMeta = {
                uid,
                salt: userDocData.salt,
                encryptedMasterKey: newEncryptedMasterKey,
                kdfIterations,
                hasAgreedToSecurityTerms: userDocData.hasAgreedToSecurityTerms === true,
            };
        }

        // Re-encrypt all existing credentials (currently encrypted with PDK)
        const credsRef = collection(db, "users", uid, "credentials");
        const credsSnap = await getDocs(credsRef);
        
        for (const credDoc of credsSnap.docs) {
            const data = credDoc.data();
            try {
                const decryptedPass = await decryptPassword(data.password, pdk);
                const reEncryptedPass = await encryptPassword(
                    decryptedPass,
                    mk,
                    `fs:v1:cred:${uid}:${credDoc.id}:password`
                );
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
    try {
        localStorage.removeItem("fs_last_google_email");
    } catch {
        // Ignore storage errors
    }

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
        prompt: "select_account",
    });

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
    const pwErr = validatePassword(password);
    if (pwErr) throw new Error(pwErr);

    const salt = generateSalt();
    const kdfIterations = RECOMMENDED_PBKDF2_ITERATIONS;
    const pdk = await deriveKey(password, salt, kdfIterations);

    const mk = await generateMasterKey();
    const masterKeyHex = await exportKeyToHex(mk);
    const encryptedMasterKey = await encryptPassword(masterKeyHex, pdk, userFieldAad(uid, "encryptedMasterKey"));

    const recoveryKey = generateRecoveryKey();
    const recoveryPdk = await deriveKey(recoveryKey, salt, kdfIterations);
    const encryptedMasterKeyRecovery = await encryptPassword(
        masterKeyHex,
        recoveryPdk,
        userFieldAad(uid, "encryptedMasterKeyRecovery")
    );

    const rawFullName = auth.currentUser?.displayName || auth.currentUser?.email?.split("@")[0] || "User";
    const encryptedFullName = await encryptPassword(rawFullName, mk, userFieldAad(uid, "fullName"));

    await setDoc(doc(db, "users", uid), {
        salt,
        kdfIterations,
        recoveryKdfIterations: kdfIterations,
        email: (auth.currentUser?.email || "").toLowerCase(),
        fullName: encryptedFullName,
        createdAt: new Date(),
        encryptedMasterKey,
        encryptedMasterKeyRecovery,
    });

    encryptionKey = mk;
    cachedCryptoMeta = { uid, salt, encryptedMasterKey, kdfIterations, hasAgreedToSecurityTerms: false };
    return recoveryKey;
}

export async function unlockVaultWithPassword(password: string): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error("Not authenticated");

    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const data = userDoc.data();
    const salt = data.salt as string;
    const kdfIterations = resolveKdfIterations(data.kdfIterations);
    const pdk = await deriveKey(password, salt, kdfIterations);

    // Pass rawPassword so initializeMasterKey can re-authenticate with Firebase
    // if MK decryption fails, to confirm it's a password reset and not a wrong password.
    await initializeMasterKey(uid, pdk, data, password);

    if (pendingSyncPassword && pendingSyncPassword !== password) {
        try {
            const newIterations = RECOMMENDED_PBKDF2_ITERATIONS;
            const newPdk = await deriveKey(pendingSyncPassword, salt, newIterations);
            const masterKeyHex = await exportKeyToHex(encryptionKey!);
            const newEncryptedMasterKey = await encryptPassword(
                masterKeyHex,
                newPdk,
                userFieldAad(uid, "encryptedMasterKey")
            );
            await setDoc(
                doc(db, "users", uid),
                { encryptedMasterKey: newEncryptedMasterKey, kdfIterations: newIterations },
                { merge: true }
            );
            cachedCryptoMeta = { uid, salt, encryptedMasterKey: newEncryptedMasterKey, kdfIterations: newIterations };
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

    const userData = userDoc.data();
    const salt = userData.salt as string;
    const encryptedMasterKeyRecovery = userData.encryptedMasterKeyRecovery as string;
    const recoveryIterations = resolveKdfIterations(userData.recoveryKdfIterations);

    const pwErr = validatePassword(newPassword);
    if (pwErr) throw new Error(pwErr);

    if (!encryptedMasterKeyRecovery) {
        throw new Error("No recovery key on file. Vault cannot be recovered.");
    }

    let masterKeyHex: string;
    try {
        // Step 1: Recover the Master Key using the Recovery Key
        const recoveryPdk = await deriveKey(recoveryKey, salt, recoveryIterations);
        masterKeyHex = await decryptPassword(
            encryptedMasterKeyRecovery,
            recoveryPdk,
            userFieldAad(user.uid, "encryptedMasterKeyRecovery")
        );
    } catch (e) {
        throw new Error("Invalid Recovery Key. Please try again.");
    }

    // Step 2: Derive a new PDK from the new password + salt (all local crypto)
    const newIterations = RECOMMENDED_PBKDF2_ITERATIONS;
    const newPdk = await deriveKey(newPassword, salt, newIterations);
    const newEncryptedMasterKey = await encryptPassword(
        masterKeyHex,
        newPdk,
        userFieldAad(user.uid, "encryptedMasterKey")
    );

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
        await setDoc(
            doc(db, "users", user.uid),
            { encryptedMasterKey: newEncryptedMasterKey, kdfIterations: newIterations },
            { merge: true }
        );
    } catch {
        throw new Error("Unable to save new vault password.");
    }

    // Step 4: Set the in-memory encryption key so the vault unlocks immediately
    encryptionKey = await importKeyFromHex(masterKeyHex);
    cachedCryptoMeta = {
        uid: user.uid,
        salt,
        encryptedMasterKey: newEncryptedMasterKey,
        kdfIterations: newIterations,
    };
    pendingSyncPassword = null;
}

/**
 * Changes the vault password while already unlocked.
 * Requires the current password to prove ownership.
 */
export async function changeVaultPassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    const pwErr = validatePassword(newPassword);
    if (pwErr) throw new Error(pwErr);

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const userData = userDoc.data();
    const salt = userData.salt as string;
    const encryptedMasterKey = userData.encryptedMasterKey as string;
    const currentIterations = resolveKdfIterations(userData.kdfIterations);

    let masterKeyHex: string;
    try {
        const currentPdk = await deriveKey(currentPassword, salt, currentIterations);
        masterKeyHex = await decryptPassword(
            encryptedMasterKey,
            currentPdk,
            userFieldAad(user.uid, "encryptedMasterKey")
        );
    } catch (e) {
        throw new Error("Incorrect current password.");
    }

    const newIterations = RECOMMENDED_PBKDF2_ITERATIONS;
    const newPdk = await deriveKey(newPassword, salt, newIterations);
    const newEncryptedMasterKey = await encryptPassword(
        masterKeyHex,
        newPdk,
        userFieldAad(user.uid, "encryptedMasterKey")
    );

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
        await setDoc(
            doc(db, "users", user.uid),
            { encryptedMasterKey: newEncryptedMasterKey, kdfIterations: newIterations },
            { merge: true }
        );
        cachedCryptoMeta = {
            uid: user.uid,
            salt,
            encryptedMasterKey: newEncryptedMasterKey,
            kdfIterations: newIterations,
        };
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

    const userData = userDoc.data();
    const salt = userData.salt as string;
    const encryptedMasterKey = userData.encryptedMasterKey as string;
    const currentIterations = resolveKdfIterations(userData.kdfIterations);

    let masterKeyHex: string;
    try {
        const currentPdk = await deriveKey(currentPassword, salt, currentIterations);
        masterKeyHex = await decryptPassword(
            encryptedMasterKey,
            currentPdk,
            userFieldAad(user.uid, "encryptedMasterKey")
        );
    } catch (e) {
        throw new Error("Incorrect current password.");
    }

    const recoveryKey = generateRecoveryKey();
    const recoveryIterations = RECOMMENDED_PBKDF2_ITERATIONS;
    const recoveryPdk = await deriveKey(recoveryKey, salt, recoveryIterations);
    const newEncryptedMasterKeyRecovery = await encryptPassword(
        masterKeyHex,
        recoveryPdk,
        userFieldAad(user.uid, "encryptedMasterKeyRecovery")
    );

    try {
        await setDoc(
            doc(db, "users", user.uid),
            { encryptedMasterKeyRecovery: newEncryptedMasterKeyRecovery, recoveryKdfIterations: recoveryIterations },
            { merge: true }
        );
        return recoveryKey;
    } catch {
        throw new Error("Unable to save new recovery key.");
    }
}

export async function signOutUser(): Promise<void> {
    await firebaseSignOut(auth);
    clearEncryptionKey();
}

export function onAuthChange(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
}

export function clearEncryptionKey() {
    encryptionKey = null;
    pendingSyncPassword = null;
    cachedCryptoMeta = null;
    clearSharingKeys();
}

export function hasEncryptionKey(): boolean {
    return encryptionKey !== null;
}

export async function checkSecurityTerms(): Promise<boolean> {
    const uid = auth.currentUser?.uid;
    if (!uid) return true;
    if (cachedCryptoMeta && cachedCryptoMeta.uid === uid && cachedCryptoMeta.hasAgreedToSecurityTerms !== undefined) {
        return cachedCryptoMeta.hasAgreedToSecurityTerms;
    }
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) return true;
    const agreed = userDoc.data().hasAgreedToSecurityTerms === true;
    if (cachedCryptoMeta && cachedCryptoMeta.uid === uid) {
        cachedCryptoMeta.hasAgreedToSecurityTerms = agreed;
    }
    return agreed;
}

export async function agreeSecurityTerms(): Promise<void> {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await setDoc(doc(db, "users", uid), { hasAgreedToSecurityTerms: true }, { merge: true });
    if (cachedCryptoMeta && cachedCryptoMeta.uid === uid) {
        cachedCryptoMeta.hasAgreedToSecurityTerms = true;
    }
}


/**
 * Enables platform biometric unlock (Fingerprint / Face ID / Windows Hello) for the
 * currently signed-in user on this device. Requires current vault password to prove ownership.
 */
/**
 * Preloads the user's salt and wrapped master key outside the click handler so Safari/iOS
 * WebAuthn enrollment runs within the transient user-activation window.
 */
export async function preloadUserCryptoMeta(): Promise<void> {
    const user = auth.currentUser;
    if (!user) return;
    if (cachedCryptoMeta && cachedCryptoMeta.uid === user.uid) return;

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) return;

    const data = userDoc.data();
    const salt = data.salt as string | undefined;
    const encryptedMasterKey = data.encryptedMasterKey as string | undefined;
    if (salt && encryptedMasterKey) {
        cachedCryptoMeta = {
            uid: user.uid,
            salt,
            encryptedMasterKey,
            kdfIterations: resolveKdfIterations(data.kdfIterations),
            hasAgreedToSecurityTerms: data.hasAgreedToSecurityTerms === true,
        };
    }
}

export async function enableBiometricUnlockForCurrentUser(
    currentPassword: string
): Promise<{ mode: BiometricMode; deviceLabel: string; method: VerificationMethod }> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated.");

    let salt: string | undefined;
    let encryptedMasterKey: string | undefined;
    let kdfIterations = PBKDF2_ITERATIONS;

    if (cachedCryptoMeta && cachedCryptoMeta.uid === user.uid) {
        salt = cachedCryptoMeta.salt;
        encryptedMasterKey = cachedCryptoMeta.encryptedMasterKey;
        kdfIterations = cachedCryptoMeta.kdfIterations;
    } else {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) throw new Error("User profile not found.");
        const data = userDoc.data();
        salt = data.salt as string | undefined;
        encryptedMasterKey = data.encryptedMasterKey as string | undefined;
        kdfIterations = resolveKdfIterations(data.kdfIterations);
        if (salt && encryptedMasterKey) {
            cachedCryptoMeta = {
                uid: user.uid,
                salt,
                encryptedMasterKey,
                kdfIterations,
                hasAgreedToSecurityTerms: data.hasAgreedToSecurityTerms === true,
            };
        }
    }

    if (!salt || !encryptedMasterKey) {
        throw new Error("Vault encryption profile is incomplete.");
    }

    let masterKeyHex: string;
    try {
        const pdk = await deriveKey(currentPassword, salt, kdfIterations);
        masterKeyHex = await decryptPassword(
            encryptedMasterKey,
            pdk,
            userFieldAad(user.uid, "encryptedMasterKey")
        );
    } catch {
        throw new Error("Incorrect current password.");
    }

    const mk = await importKeyFromHex(masterKeyHex);
    return await enrollBiometricUnlock(user.uid, user.email || "", mk);
}

/**
 * Unlocks the vault using the device's enrolled biometric authenticator (Fingerprint / Face ID / Windows Hello).
 */
export async function unlockVaultWithBiometrics(): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated.");

    const { masterKeyHex, method } = await unwrapMasterKeyWithBiometricsResult(user.uid);
    const mk = await importKeyFromHex(masterKeyHex);

    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) throw new Error("User profile not found.");

    const data = userDoc.data();
    if (data.fullName && typeof data.fullName === "string" && data.fullName.includes(":")) {
        try {
            await decryptPassword(data.fullName, mk, userFieldAad(user.uid, "fullName"));
        } catch {
            await disableBiometricUnlock(user.uid).catch(() => {});
            throw new Error(getVerificationProfile(method).errors.keyMismatch);
        }
    }

    if (typeof data.salt === "string" && typeof data.encryptedMasterKey === "string") {
        cachedCryptoMeta = {
            uid: user.uid,
            salt: data.salt,
            encryptedMasterKey: data.encryptedMasterKey,
            kdfIterations: resolveKdfIterations(data.kdfIterations),
            hasAgreedToSecurityTerms: data.hasAgreedToSecurityTerms === true,
        };
    }

    encryptionKey = mk;
    pendingSyncPassword = null;
}
