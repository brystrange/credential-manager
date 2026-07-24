import React, { useState, useEffect } from "react";
import { FiLock, FiEye, FiEyeOff } from "react-icons/fi";
import { changeVaultPassword, generateNewRecoveryKey, validatePassword } from "../services/authService";
import { migrateLegacyData, hasLegacyCredentials } from "../services/credentialService";
import { deleteAccount } from "../services/userService";

export default function SettingsPage() {
    const [currentPw, setCurrentPw] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");

    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);

    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [busy, setBusy] = useState(false);

    const [recoveryKeyPw, setRecoveryKeyPw] = useState("");
    const [showRecoveryKeyPw, setShowRecoveryKeyPw] = useState(false);
    const [generatedRecoveryKey, setGeneratedRecoveryKey] = useState("");
    const [recoveryError, setRecoveryError] = useState("");
    const [recoveryBusy, setRecoveryBusy] = useState(false);

    const [migrationBusy, setMigrationBusy] = useState(false);
    const [migrationError, setMigrationError] = useState("");
    const [migrationSuccess, setMigrationSuccess] = useState("");
    const [showMigration, setShowMigration] = useState(false);

    const [deleteAccountPw, setDeleteAccountPw] = useState("");
    const [deleteAccountWord, setDeleteAccountWord] = useState("");
    const [showDeleteAccountPw, setShowDeleteAccountPw] = useState(false);
    const [deleteAccountError, setDeleteAccountError] = useState("");
    const [deleteAccountBusy, setDeleteAccountBusy] = useState(false);

    useEffect(() => {
        hasLegacyCredentials().then(setShowMigration).catch(console.error);
    }, []);

    const handleMigrate = async () => {
        setMigrationError("");
        setMigrationSuccess("");
        setMigrationBusy(true);
        try {
            await migrateLegacyData();
            setShowMigration(false);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to migrate data.";
            setMigrationError(msg);
        } finally {
            setMigrationBusy(false);
        }
    };

    const handleDeleteAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setDeleteAccountError("");

        if (deleteAccountWord !== "delete") {
            setDeleteAccountError("You must type 'delete' to confirm.");
            return;
        }

        if (!window.confirm("Are you absolutely sure? This will delete all your data and cannot be undone.")) {
            return;
        }

        setDeleteAccountBusy(true);
        try {
            await deleteAccount(deleteAccountPw);
        } catch (err: any) {
            console.error(err);
            if (err.message === "auth/wrong-password" || err.code === "auth/wrong-password") {
                setDeleteAccountError("Incorrect password.");
            } else {
                setDeleteAccountError(err.message || "Failed to delete account.");
            }
        } finally {
            setDeleteAccountBusy(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setSuccess("");

        const passwordError = validatePassword(newPw);
        if (passwordError) {
            setError(passwordError);
            return;
        }
        if (newPw !== confirmPw) {
            setError("New passwords do not match.");
            return;
        }

        setBusy(true);
        try {
            await changeVaultPassword(currentPw, newPw);
            setSuccess("Vault password changed successfully.");
            setCurrentPw("");
            setNewPw("");
            setConfirmPw("");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to change password.";
            setError(msg);
        } finally {
            setBusy(false);
        }
    };

    const handleGenerateRecoveryKey = async (e: React.FormEvent) => {
        e.preventDefault();
        setRecoveryError("");
        setGeneratedRecoveryKey("");
        setRecoveryBusy(true);

        try {
            const key = await generateNewRecoveryKey(recoveryKeyPw);
            setGeneratedRecoveryKey(key);
            setRecoveryKeyPw("");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to generate recovery key.";
            setRecoveryError(msg);
        } finally {
            setRecoveryBusy(false);
        }
    };

    return (
        <div style={{ maxWidth: "600px" }}>
            <div className="content-header">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-subtitle">
                        Manage your vault security and preferences
                    </p>
                </div>
            </div>

            <div style={{ background: "var(--bg-card)", padding: "24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", marginBottom: "24px" }}>
                <h3 style={{ marginBottom: "8px" }}>Change Vault Password</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    You must enter your current vault password to set a new one.
                </p>

                {error && <div className="auth-error" style={{ marginBottom: "16px" }}>{error}</div>}
                {success && <div className="auth-success" style={{ marginBottom: "16px", color: "var(--success)" }}>{success}</div>}

                <form onSubmit={handleSubmit} className="auth-form" style={{ gap: "12px", display: "flex", flexDirection: "column" }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <div className="input-icon"><FiLock size={16} /></div>
                        <input
                            type={showCurrentPw ? "text" : "password"}
                            placeholder="Current password"
                            value={currentPw}
                            onChange={(e) => setCurrentPw(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            className="input-suffix"
                            onClick={() => setShowCurrentPw(!showCurrentPw)}
                        >
                            {showCurrentPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <div className="input-icon"><FiLock size={16} /></div>
                        <input
                            type={showNewPw ? "text" : "password"}
                            placeholder="New password"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            required
                            minLength={6}
                        />
                        <button
                            type="button"
                            className="input-suffix"
                            onClick={() => setShowNewPw(!showNewPw)}
                        >
                            {showNewPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                        <div className="input-icon"><FiLock size={16} /></div>
                        <input
                            type={showConfirmPw ? "text" : "password"}
                            placeholder="Confirm new password"
                            value={confirmPw}
                            onChange={(e) => setConfirmPw(e.target.value)}
                            required
                            minLength={6}
                        />
                        <button
                            type="button"
                            className="input-suffix"
                            onClick={() => setShowConfirmPw(!showConfirmPw)}
                        >
                            {showConfirmPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                    </div>

                    <button type="submit" className="auth-submit" disabled={busy} style={{ marginTop: "8px", maxWidth: "200px" }}>
                        {busy ? "Updating..." : "Change Password"}
                    </button>
                </form>
            </div>

            <div style={{ background: "var(--bg-card)", padding: "24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", marginBottom: "24px" }}>
                <h3 style={{ marginBottom: "8px" }}>Recovery Key</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    Generate a new Recovery Key if you lost your old one or are an existing user. This will invalidate any old Recovery Keys.
                </p>

                {recoveryError && <div className="auth-error" style={{ marginBottom: "16px" }}>{recoveryError}</div>}

                {generatedRecoveryKey ? (
                    <div style={{ background: "var(--bg-glass)", border: "1px solid var(--danger)", padding: "16px", borderRadius: "var(--radius-md)", marginBottom: "20px", textAlign: "left" }}>
                        <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                            This is your <strong>only</strong> way to recover your vault if you forget your password. We cannot recover it for you. Copy it now and store it somewhere safe.
                        </p>
                        <div style={{ display: "block", background: "var(--bg-card)", padding: "12px", borderRadius: "var(--radius-sm)", userSelect: "all", fontSize: "1rem", fontFamily: "monospace", color: "var(--text-primary)", border: "1px dashed var(--border-color)", wordBreak: "break-all", textAlign: "center" }}>
                            {generatedRecoveryKey}
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleGenerateRecoveryKey} className="auth-form" style={{ gap: "12px", display: "flex", flexDirection: "column" }}>
                        <div className="form-group" style={{ margin: 0 }}>
                            <div className="input-icon"><FiLock size={16} /></div>
                            <input
                                type={showRecoveryKeyPw ? "text" : "password"}
                                placeholder="Current password"
                                value={recoveryKeyPw}
                                onChange={(e) => setRecoveryKeyPw(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                className="input-suffix"
                                onClick={() => setShowRecoveryKeyPw(!showRecoveryKeyPw)}
                            >
                                {showRecoveryKeyPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                            </button>
                        </div>
                        <button type="submit" className="auth-submit" disabled={recoveryBusy} style={{ marginTop: "8px", maxWidth: "250px" }}>
                            {recoveryBusy ? "Generating..." : "Generate New Recovery Key"}
                        </button>
                    </form>
                )}
            </div>

            {showMigration && (
                <div style={{ background: "var(--bg-card)", padding: "24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", marginBottom: "24px" }}>
                    <h3 style={{ marginBottom: "8px" }}>Data Privacy Migration</h3>
                    <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                        We recently introduced Zero-Knowledge Metadata Encryption. Click below to scan and encrypt all your legacy credentials.
                    </p>

                    {migrationError && <div className="auth-error" style={{ marginBottom: "16px" }}>{migrationError}</div>}
                    {migrationSuccess && <div className="auth-success" style={{ marginBottom: "16px", color: "var(--success)" }}>{migrationSuccess}</div>}

                    <button 
                        onClick={handleMigrate}
                        className="auth-submit" 
                        disabled={migrationBusy} 
                        style={{ maxWidth: "250px" }}
                    >
                        {migrationBusy ? "Encrypting..." : "Migrate / Encrypt All"}
                    </button>
                </div>
            )}

            <div style={{ background: "rgba(221, 40, 40, 0.05)", padding: "24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--danger)", marginBottom: "24px" }}>
                <h3 style={{ marginBottom: "8px", color: "var(--danger)" }}>Danger Zone</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    Permanently delete your account and all associated data. This action cannot be undone. 
                    Deleted email addresses can be reused for a fresh account.
                </p>

                {deleteAccountError && <div className="auth-error" style={{ marginBottom: "16px" }}>{deleteAccountError}</div>}

                <form onSubmit={handleDeleteAccount} className="auth-form" style={{ gap: "12px", display: "flex", flexDirection: "column" }}>
                    <div className="form-group" style={{ margin: 0 }}>
                        <div className="input-icon"><FiLock size={16} /></div>
                        <input
                            type={showDeleteAccountPw ? "text" : "password"}
                            placeholder="Current password"
                            value={deleteAccountPw}
                            onChange={(e) => setDeleteAccountPw(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            className="input-suffix"
                            onClick={() => setShowDeleteAccountPw(!showDeleteAccountPw)}
                        >
                            {showDeleteAccountPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                    </div>
                    
                    <div className="form-group" style={{ margin: 0 }}>
                        <input
                            type="text"
                            placeholder='Type "delete" to confirm'
                            value={deleteAccountWord}
                            onChange={(e) => setDeleteAccountWord(e.target.value)}
                            required
                            style={{ paddingLeft: "12px" }}
                        />
                    </div>

                    <button type="submit" className="auth-submit" disabled={deleteAccountBusy || deleteAccountWord !== 'delete'} style={{ marginTop: "8px", maxWidth: "250px", background: "var(--danger)" }}>
                        {deleteAccountBusy ? "Deleting..." : "Delete Account"}
                    </button>
                </form>
            </div>
        </div>
    );
}
