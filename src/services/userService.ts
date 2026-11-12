import { auth, db, storage } from "../firebaseConfig";
import { EmailAuthProvider, reauthenticateWithCredential, reauthenticateWithPopup, GoogleAuthProvider, deleteUser } from "firebase/auth";
import { collection, getDocs, doc, deleteDoc, getDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { deriveKey, decryptPassword } from "./crypto";
import { clearEncryptionKey, resolveKdfIterations, userFieldAad } from "./authService";
import { disableBiometricUnlock } from "./biometricService";
import { listShares, removeShare } from "./shareService";

export async function deleteAccount(password: string, onProgress?: (msg: string) => void): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new Error("No authenticated user.");

    const isGoogleUser = user.providerData.some((p) => p.providerId === "google.com");

    if (isGoogleUser) {
        // Verify Vault password manually via zero-knowledge decryption proof
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const data = userDoc.data();
        if (!data || !data.salt || !data.encryptedMasterKey) {
            throw new Error("User profile or vault metadata missing.");
        }
        try {
            const pdk = await deriveKey(password, data.salt, resolveKdfIterations(data.kdfIterations));
            await decryptPassword(data.encryptedMasterKey, pdk, userFieldAad(user.uid, "encryptedMasterKey"));
        } catch {
            throw new Error("auth/wrong-password");
        }
    } else {
        // Email user - reauthenticate to verify password and refresh token
        if (!user.email) throw new Error("User has no email.");
        const credential = EmailAuthProvider.credential(user.email, password);
        await reauthenticateWithCredential(user, credential);
    }

    const uid = user.uid;

    // --- Data Deletion ---
    
    // 1. Delete all credentials and their history
    console.log("Deleting credentials and history...");
    if (onProgress) onProgress("Deleting credentials and history...");
    const credsSnap = await getDocs(collection(db, "users", uid, "credentials"));
    for (const credDoc of credsSnap.docs) {
        const historySnap = await getDocs(collection(credDoc.ref, "history"));
        for (const hDoc of historySnap.docs) {
            await deleteDoc(hDoc.ref);
        }
        await deleteDoc(credDoc.ref);
    }
    console.log("Credentials deleted.");

    // 2. Delete all files (Storage + Firestore)
    console.log("Deleting files...");
    if (onProgress) onProgress("Deleting files...");
    const filesSnap = await getDocs(collection(db, "users", uid, "files"));
    for (const fileDoc of filesSnap.docs) {
        const fileData = fileDoc.data();
        if (fileData.storagePath) {
            try {
                await deleteObject(ref(storage, fileData.storagePath));
            } catch (e: any) {
                if (e.code !== 'storage/object-not-found') {
                    console.error("Failed to delete storage object", e);
                }
            }
        }
        await deleteDoc(fileDoc.ref);
    }
    console.log("Files deleted.");

    // 3. Delete all folders
    console.log("Deleting folders...");
    if (onProgress) onProgress("Deleting folders...");
    const foldersSnap = await getDocs(collection(db, "users", uid, "folders"));
    for (const folderDoc of foldersSnap.docs) {
        await deleteDoc(folderDoc.ref);
    }
    console.log("Folders deleted.");

    // 3b. Delete user's shared folder copies
    try {
        if (onProgress) onProgress("Deleting received files...");
        const shares = await listShares();
        for (const item of shares.received) {
            await removeShare(item.id).catch((e) => console.warn("Failed to remove share on account deletion:", e));
        }
    } catch (e) {
        console.warn("Could not list shares during account deletion:", e);
    }

    // 4. Delete user document
    console.log("Deleting user document...");
    if (onProgress) onProgress("Deleting user document...");
    await deleteDoc(doc(db, "users", uid));
    console.log("User document deleted.");

    // --- Delete Firebase Auth User ---
    console.log("Deleting overall data...");
    if (onProgress) onProgress("Deleting overall data...");
    try {
        await deleteUser(user);
    } catch (e: any) {
        if (e.code === 'auth/requires-recent-login' && isGoogleUser) {
            await reauthenticateWithPopup(user, new GoogleAuthProvider());
            await deleteUser(user);
        } else {
            throw e;
        }
    }
    
    await disableBiometricUnlock(uid).catch(() => {});
    clearEncryptionKey();
}
