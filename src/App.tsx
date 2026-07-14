import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { onAuthChange, signOutUser, clearEncryptionKey, hasEncryptionKey, unlockVaultWithPassword, setupGoogleVault, resetGoogleVaultPassword, checkSecurityTerms, agreeSecurityTerms, validatePassword } from "./services/authService";
import type { Credential, CredentialInput } from "./services/credentialService";
import {
    getCredentials,
    addCredential,
    updateCredential,
    deleteCredential,
} from "./services/credentialService";
import type { Platform } from "./services/platformService";
import { getPlatforms } from "./services/platformService";
import AuthPage from "./components/AuthPage";
import LandingPage from "./components/LandingPage";
import CredentialModal from "./components/CredentialModal";
import HistoryPanel from "./components/HistoryPanel";
import FAB from "./components/FAB";
import SearchBar from "./components/SearchBar";
import ConfirmDialog from "./components/ConfirmDialog";
import PlatformGroup from "./components/PlatformGroup";
import PricingPage from "./components/PricingPage";
import SettingsPage from "./components/SettingsPage";
import ManageSubscriptionPage from "./components/ManageSubscriptionPage";
import { SubscriptionProvider, useSubscription } from "./context/SubscriptionContext";
import {
    FiLogOut,
    FiInbox,
    FiKey,
    FiMenu,
    FiX,
    FiMoon,
    FiSun,
    FiLock,
    FiEye,
    FiEyeOff,
    FiSettings,
    FiInfo,
    FiCreditCard,
} from "react-icons/fi";
import type { User } from "firebase/auth";
import { useTheme } from "./context/ThemeContext";

/* ─── Welcome Splash ─────────────────────────────────────────────────────────
   Shown for ~2 seconds after a successful fresh login before the dashboard.
──────────────────────────────────────────────────────────────────────────── */
function WelcomeSplash({
    displayName,
    onDone,
}: {
    displayName: string;
    onDone: () => void;
}) {
    useEffect(() => {
        const t = setTimeout(onDone, 2200);
        return () => clearTimeout(t);
    }, [onDone]);

    return (
        <div className="welcome-splash">
            <div className="welcome-splash-icon">
                <img src="/logo.png" alt="Logo" style={{ width: 52, height: 52 }} />
            </div>
            <h1 className="welcome-splash-title">Welcome back</h1>
            <p className="welcome-splash-name">{displayName}</p>
            <div className="welcome-splash-bar">
                <div className="welcome-splash-bar-fill" />
            </div>
            <p className="welcome-splash-hint">Unlocking your vault…</p>
        </div>
    );
}

/* ─── Google Vault Setup ─────────────────────────────────────────────────────
   Shown to new Google users who have no Firestore record yet.
   They create a vault password that will be used to derive their encryption key.
──────────────────────────────────────────────────────────────────────────── */
function GoogleVaultSetup({
    userEmail,
    onSetup,
    onDone,
    onCancel,
}: {
    userEmail: string;
    onSetup: (password: string) => Promise<string>;
    onDone: () => void;
    onCancel: () => void;
}) {
    const [pw, setPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [recoveryKey, setRecoveryKey] = useState("");

    const MIN_BUSY_MS = 600;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const passwordError = validatePassword(pw);
        if (passwordError) {
            setError(passwordError);
            return;
        }
        if (pw !== confirmPw) { setError("Passwords do not match."); return; }
        setError("");
        setBusy(true);
        const t0 = Date.now();
        try {
            const recKey = await onSetup(pw);
            setRecoveryKey(recKey);
        } catch {
            setError("Failed to set up vault. Please try again.");
        } finally {
            const gap = MIN_BUSY_MS - (Date.now() - t0);
            if (gap > 0) await new Promise((r) => setTimeout(r, gap));
            setBusy(false);
        }
    };

    if (recoveryKey) {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <div className="auth-logo">
                            <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32 }} />
                        </div>
                        <h1>Save Your Recovery Key</h1>
                        <p className="auth-subtitle">
                            Signed in as <strong>{userEmail}</strong>
                        </p>
                    </div>

                    <div style={{ background: "var(--bg-glass)", border: "1px solid var(--danger)", padding: "16px", borderRadius: "var(--radius-md)", marginBottom: "20px", textAlign: "left" }}>
                        <p style={{ margin: "0 0 12px", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                            This is your <strong>only</strong> way to recover your vault if you forget your password. We cannot recover it for you. Copy it now and store it somewhere safe.
                        </p>
                        <div style={{ display: "block", background: "var(--bg-card)", padding: "12px", borderRadius: "var(--radius-sm)", userSelect: "all", fontSize: "1rem", fontFamily: "monospace", color: "var(--text-primary)", border: "1px dashed var(--border-color)", wordBreak: "break-all", textAlign: "center" }}>
                            {recoveryKey}
                        </div>
                    </div>

                    <button className="auth-submit" onClick={onDone} style={{ marginTop: 0 }}>
                        I have saved it
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">
                        <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32 }} />
                    </div>
                    <h1>Set up your vault</h1>
                    <p className="auth-subtitle">
                        Signed in as <strong>{userEmail}</strong>
                    </p>
                </div>

                <div className="vault-unlock-info">
                    <FiLock size={20} />
                    <div>
                        <strong>Create a vault password</strong>
                        <p>This password encrypts your credentials. Keep it safe.</p>
                    </div>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <div className="input-icon"><FiLock size={16} /></div>
                        <input
                            type={showPw ? "text" : "password"}
                            placeholder="Vault password"
                            value={pw}
                            onChange={(e) => setPw(e.target.value)}
                            required
                            minLength={6}
                            autoFocus
                            autoComplete="new-password"
                        />
                        <button type="button" className="input-suffix" onClick={() => setShowPw(!showPw)}>
                            {showPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                    </div>
                    <div className="form-group">
                        <div className="input-icon"><FiLock size={16} /></div>
                        <input
                            type={showConfirmPw ? "text" : "password"}
                            placeholder="Confirm vault password"
                            value={confirmPw}
                            onChange={(e) => setConfirmPw(e.target.value)}
                            required
                            minLength={6}
                            autoComplete="new-password"
                        />
                        <button type="button" className="input-suffix" onClick={() => setShowConfirmPw(!showConfirmPw)}>
                            {showConfirmPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                    </div>
                    <button type="submit" className="auth-submit" disabled={busy}>
                        {busy ? "Setting Up..." : "Create"}
                    </button>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        style={{
                            display: "block",
                            margin: "10px auto 0",
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                            fontSize: "0.82rem",
                            cursor: "pointer",
                            padding: "4px 8px",
                            opacity: busy ? 0.5 : 1,
                        }}
                    >
                        Cancel
                    </button>
                </form>

            </div>
        </div>
    );
}

/* ─── Vault Unlock Gate ──────────────────────────────────────────────────────
   Shown ONLY when the user returns to the app after a page reload.
   Firebase restores the session but the in-memory encryption key is gone,
   so we ask for their password to re-derive it.
   The password is the same one used to sign in.
──────────────────────────────────────────────────────────────────────────── */
function VaultUnlockGate({
    userEmail,
    onUnlocked,
}: {
    userEmail: string;
    onUnlocked: () => void;
}) {
    const [pw, setPw] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState<"unlock" | "reset-vault">("unlock");

    // Reset-vault form state
    const [newPw, setNewPw] = useState("");
    const [confirmNewPw, setConfirmNewPw] = useState("");
    const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
    const [showNewPw, setShowNewPw] = useState(false);
    const [showConfirmNewPw, setShowConfirmNewPw] = useState(false);

    const MIN_BUSY_MS = 600;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        const t0 = Date.now();
        try {
            await unlockVaultWithPassword(pw);
            import("./hooks/useLoginThrottle").then(m => m.clearLoginThrottle());
            onUnlocked();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "";
            if (msg.includes("vault-out-of-sync")) {
                setError("Your vault is locked with your OLD password. Please enter your old password to sync it, or click 'Use Recovery Key' if you forgot it.");
            } else if (msg.includes("Invalid vault password") || msg.includes("decryption")) {
                setError("Incorrect password. Please try again.");
            } else {
                setError("Failed to unlock vault. Please try again.");
            }
        } finally {
            const gap = MIN_BUSY_MS - (Date.now() - t0);
            if (gap > 0) await new Promise((r) => setTimeout(r, gap));
            setBusy(false);
        }
    };

    const handleResetVaultPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        const passwordError = validatePassword(newPw);
        if (passwordError) {
            setError(passwordError);
            return;
        }
        if (newPw !== confirmNewPw) {
            setError("Passwords do not match.");
            return;
        }
        if (!recoveryKeyInput) {
            setError("Recovery Key is required.");
            return;
        }
        setBusy(true);
        const t0 = Date.now();
        try {
            await resetGoogleVaultPassword(newPw, recoveryKeyInput.trim());
            import("./hooks/useLoginThrottle").then(m => m.clearLoginThrottle());
            onUnlocked();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "";
            if (msg.includes("User profile not found")) {
                setError("Account profile not found. Please contact support.");
            } else if (msg.includes("Invalid Recovery Key") || msg.includes("No recovery key")) {
                setError(msg);
            } else {
                setError("Failed to reset vault password. Please try again.");
            }
        } finally {
            const gap = MIN_BUSY_MS - (Date.now() - t0);
            if (gap > 0) await new Promise((r) => setTimeout(r, gap));
            setBusy(false);
        }
    };

    // ── Reset-vault view ─────────────────────────────────────────────────────
    if (view === "reset-vault") {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <div className="auth-logo">
                            <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32 }} />
                        </div>
                        <h1>Reset Vault Password</h1>
                        <p className="auth-subtitle">
                            Signed in as <strong>{userEmail}</strong>
                        </p>
                    </div>

                    <div className="vault-unlock-info">
                        <FiLock size={20} />
                        <div>
                            <strong>Reset your vault password</strong>
                            <p>
                                Password must have 1 uppercase and 1 lowercase, number, and a special character.
                            </p>
                        </div>
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <form onSubmit={handleResetVaultPassword} className="auth-form">
                        <div className="form-group">
                            <div className="input-icon"><FiLock size={16} /></div>
                            <input
                                type="text"
                                placeholder="24-character Recovery Key"
                                value={recoveryKeyInput}
                                onChange={(e) => setRecoveryKeyInput(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                        <div className="form-group">
                            <div className="input-icon"><FiLock size={16} /></div>
                            <input
                                type={showNewPw ? "text" : "password"}
                                placeholder="New password"
                                value={newPw}
                                onChange={(e) => setNewPw(e.target.value)}
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="input-suffix"
                                onClick={() => setShowNewPw(!showNewPw)}
                            >
                                {showNewPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                            </button>
                        </div>
                        <div className="form-group">
                            <div className="input-icon"><FiLock size={16} /></div>
                            <input
                                type={showConfirmNewPw ? "text" : "password"}
                                placeholder="Confirm password"
                                value={confirmNewPw}
                                onChange={(e) => setConfirmNewPw(e.target.value)}
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="input-suffix"
                                onClick={() => setShowConfirmNewPw(!showConfirmNewPw)}
                            >
                                {showConfirmNewPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                            </button>
                        </div>
                        <button type="submit" className="auth-submit" disabled={busy}>
                            {busy ? "Resetting…" : "Reset Password"}
                        </button>
                    </form>

                    <button
                        type="button"
                        className="google-btn"
                        style={{ marginTop: "12px", background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                        onClick={() => { setView("unlock"); setError(""); setNewPw(""); setConfirmNewPw(""); setRecoveryKeyInput(""); }}
                        disabled={busy}
                    >
                        Back
                    </button>
                </div>
            </div>
        );
    }

    // ── Unlock view ──────────────────────────────────────────────────────────
    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">
                        <img src="/logo.png" alt="Logo" style={{ width: 32, height: 32 }} />
                    </div>
                    <h1>Welcome back</h1>
                    <p className="auth-subtitle">
                        Signed in as <strong>{userEmail}</strong>
                    </p>
                </div>

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <div className="input-icon">
                            <FiLock size={16} />
                        </div>
                        <input
                            type={showPw ? "text" : "password"}
                            placeholder="Your password"
                            value={pw}
                            onChange={(e) => setPw(e.target.value)}
                            required
                            autoFocus
                            autoComplete="current-password"
                        />
                        <button
                            type="button"
                            className="input-suffix"
                            onClick={() => setShowPw(!showPw)}
                        >
                            {showPw ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                    </div>
                    <button type="submit" className="auth-submit" disabled={busy} style={{ marginTop: "10px" }}>
                        {busy ? "Unlocking..." : "Unlock Vault"}
                    </button>

                    <button
                    type="button"
                    className="google-btn"
                    style={{background: "#f5f5f521", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                    onClick={() => signOutUser()}
                    >
                    Sign out
                    </button>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                        <button
                            type="button"
                            onClick={() => { setView("reset-vault"); setError(""); setPw(""); }}
                            style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.73rem",fontWeight: "600", cursor: "pointer", padding: 0 }}
                            disabled={busy}
                        >
                            Use Recovery Key
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}

function AppInner({
    onUidChange,
    onCredentialCountChange,
}: {
    onUidChange: (uid: string | null) => void;
    onCredentialCountChange: (count: number) => void;
}) {
    const { theme, toggleTheme } = useTheme();
    const [user, setUser] = useState<User | null | undefined>(undefined);
    const { isAtLimit, isPro } = useSubscription();
    
    const location = useLocation();
    const navigate = useNavigate();
    const isSettingsRoute = location.pathname === "/settings";
    const isManageSubscriptionRoute = location.pathname === "/subscription";

    // Tracks whether the in-memory encryption key is ready.
    // Stays false until a fresh login OR a successful VaultUnlockGate entry.
    const [vaultUnlocked, setVaultUnlocked] = useState(false);

    // State set to true while AuthPage is actively running a login.
    // Prevents VaultUnlockGate from flashing AND prevents the dashboard
    // from briefly rendering during the window between onAuthChange firing
    // and the encryption key being fully derived.
    const [loginInProgress, setLoginInProgress] = useState(false);

    // Controls the "Welcome back" splash shown briefly after fresh login.
    const [showWelcome, setShowWelcome] = useState(false);

    // Set when a Google sign-in reveals the user has no Firestore record yet.
    const [isNewGoogleUser, setIsNewGoogleUser] = useState(false);

    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [search, setSearch] = useState("");
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [signOutLoading, setSignOutLoading] = useState(false);

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
    const [needsSecurityTerms, setNeedsSecurityTerms] = useState(false);
    const [hideSecurityTermsChecked, setHideSecurityTermsChecked] = useState(false);

    // Pricing page
    const [pricingOpen, setPricingOpen] = useState(false);

    // History panel
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyCredential, setHistoryCredential] = useState<Credential | null>(null);

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);

    const currentUserRef = useRef(user);
    useEffect(() => {
        currentUserRef.current = user;
    }, [user]);

    useEffect(() => {
        const unsub = onAuthChange((u) => {
            // Block unverified users
            if (u && !u.emailVerified) {
                signOutUser();
                return;
            }
            setUser(u);
            onUidChange(u?.uid ?? null);
            if (!u) {
                setCredentials([]);
                setVaultUnlocked(false);
                clearEncryptionKey();
                
                if (currentUserRef.current) {
                    navigate("/login");
                }
            }
        });
        return unsub;
    }, [onUidChange, navigate]);

    // Load platforms from Firestore (shared collection, no auth required to read)
    const loadPlatforms = useCallback(async () => {
        try {
            const data = await getPlatforms();
            setPlatforms(data);
        } catch (err) {
            console.error("Failed to load platforms:", err);
        }
    }, []);

    useEffect(() => {
        if (user && user.emailVerified) {
            loadPlatforms();
        }
    }, [loadPlatforms, user]);

    const loadCredentials = useCallback(async () => {
        if (!hasEncryptionKey()) return;
        setLoading(true);
        try {
            const creds = await getCredentials();
            setCredentials(creds);
            onCredentialCountChange(creds.length);
        } catch (err) {
            console.error("Failed to load credentials:", err);
        } finally {
            setLoading(false);
        }
    }, [onCredentialCountChange]);

    // Called after a successful login OR after vault unlock on page reload
    const handleAuthSuccess = async () => {
        setShowWelcome(true);
        setLoginInProgress(false);
        setVaultUnlocked(true);
        try {
            const hasAgreed = await checkSecurityTerms();
            if (!hasAgreed) setNeedsSecurityTerms(true);
        } catch (err) {
            console.error("Failed to check security terms:", err);
        }
        loadCredentials();
    };

    // Called by AuthPage just before it starts the async sign-in.
    // Prevents VaultUnlockGate and the dashboard from appearing during the
    // brief window where onAuthChange has fired but the key isn't set yet.
    const handleAuthStart = () => {
        setLoginInProgress(true);
    };

    // Called by AuthPage when a login attempt ends (success or failure).
    // Clears the in-progress guard so correct gates can render.
    const handleAuthEnd = () => {
        setLoginInProgress(false);
    };

    // Called by AuthPage when Google auth reveals a brand-new user.
    const handleNewGoogleUser = () => {
        setIsNewGoogleUser(true);
    };

    // Called by GoogleVaultSetup when the user submits their new vault password.
    const handleGoogleVaultSetup = async (password: string) => {
        setLoginInProgress(true);
        const recKey = await setupGoogleVault(password);
        return recKey;
    };

    const handleGoogleVaultSetupDone = () => {
        setIsNewGoogleUser(false);
        handleAuthSuccess();
    };

    const handleAdd = () => {
        setEditingCredential(null);
        setModalOpen(true);
    };

    const handleOpenPricing = () => {
        setPricingOpen(true);
        setSidebarOpen(false);
    };

    const handleEdit = (cred: Credential) => {
        setEditingCredential(cred);
        setModalOpen(true);
    };

    const handleModalSubmit = async (data: CredentialInput) => {
        setActionLoading(true);
        try {
            if (editingCredential) {
                await updateCredential(editingCredential.id, data, editingCredential);
            } else {
                await addCredential(data);
            }
            setModalOpen(false);
            setEditingCredential(null);
            await loadCredentials();
        } catch (err) {
            console.error("Failed to save credential:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setActionLoading(true);
        try {
            await deleteCredential(deleteTarget.id);
            setDeleteTarget(null);
            await loadCredentials();
        } catch (err) {
            console.error("Failed to delete credential:", err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleHistory = (cred: Credential) => {
        setHistoryCredential(cred);
        setHistoryOpen(true);
        setSidebarOpen(false);
    };

    const handleSignOut = async () => {
        setSignOutLoading(true);
        setVaultUnlocked(false);
        setIsNewGoogleUser(false);
        await signOutUser();
        setSignOutLoading(false);
    };

    const filteredCredentials = credentials.filter((c) =>
        c.platform.toLowerCase().includes(search.toLowerCase()) ||
        c.accountName?.toLowerCase().includes(search.toLowerCase()) ||
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        c.username.toLowerCase().includes(search.toLowerCase())
    );

    // Group credentials by platform
    const groupedCredentials = useMemo(() => {
        const groups = new Map<string, Credential[]>();
        for (const cred of filteredCredentials) {
            const key = cred.platform.toLowerCase();
            const existing = groups.get(key);
            if (existing) {
                existing.push(cred);
            } else {
                groups.set(key, [cred]);
            }
        }
        return groups;
    }, [filteredCredentials]);

    // Ordered platform names (by first appearance / most recent)
    const platformOrder = useMemo(() => {
        const seen = new Set<string>();
        const order: string[] = [];
        for (const cred of filteredCredentials) {
            const key = cred.platform.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                order.push(cred.platform);
            }
        }
        return order;
    }, [filteredCredentials]);

    // Existing platform names for the picker's "already added" badges
    const existingPlatforms = useMemo(
        () => [...new Set(credentials.map((c) => c.platform))],
        [credentials]
    );

    // ── Render gates ─────────────────────────────────────────────────────────

    // Waiting for Firebase to restore session
    if (user === undefined) {
        return (
            <div className="app-loading">
                <img src="/logo.png" alt="Logo" style={{ width: 36, height: 36 }} className="pulse" />
                <p>Initializing vault…</p>
            </div>
        );
    }

    // Not signed in
    if (!user) {
        if (location.pathname === "/login") {
            return (
                <AuthPage
                    onAuthSuccess={handleAuthSuccess}
                    onAuthStart={handleAuthStart}
                    onAuthEnd={handleAuthEnd}
                    onNewGoogleUser={handleNewGoogleUser}
                />
            );
        }
        if (currentUserRef.current) {
            return null;
        }
        if (location.pathname !== "/") {
            return <Navigate to="/" replace />;
        }
        return <LandingPage />;
    }

    // Ensure valid authenticated routes
    if (
        location.pathname !== "/" &&
        location.pathname !== "/settings" &&
        location.pathname !== "/subscription"
    ) {
        return <Navigate to="/" replace />;
    }

    // New Google user — has Firebase auth but no Firestore record yet.
    // Show vault setup so they can create their encryption password.
    if (isNewGoogleUser) {
        return (
            <GoogleVaultSetup
                userEmail={user.email || "Unknown user"}
                onSetup={handleGoogleVaultSetup}
                onDone={handleGoogleVaultSetupDone}
                onCancel={() => signOutUser()}
            />
        );
    }

    // Signed in but vault not yet unlocked — page was reloaded.
    // Skip this gate if a fresh login is currently in progress,
    // otherwise we'd flash the unlock screen mid-login.
    if (!vaultUnlocked && !loginInProgress) {
        return (
            <VaultUnlockGate
                userEmail={user.email ?? ""}
                onUnlocked={handleAuthSuccess}
            />
        );
    }

    // Show the welcome splash:
    //  - While loginInProgress is true (onAuthChange fired, key not ready yet)
    //  - After handleAuthSuccess sets showWelcome=true (until the timer fires)
    // This ensures the dashboard never flashes before the splash.
    if (showWelcome || loginInProgress) {
        const displayNameForSplash = user.displayName || user.email?.split("@")[0] || "User";
        return (
            <WelcomeSplash
                displayName={displayNameForSplash}
                onDone={() => setShowWelcome(false)}
            />
        );
    }

    const totalCredentials = credentials.length;
    const displayName = user.displayName || user.email?.split("@")[0] || "User";

    const ITEMS_PER_PAGE = 30;
    const totalPages = Math.max(1, Math.ceil(platformOrder.length / ITEMS_PER_PAGE));
    const paginatedPlatforms = platformOrder.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    return (
        <div className="app-shell">
            {/* Mobile header bar */}
            <header className="mobile-header">
                <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    {sidebarOpen ? <FiX size={20} /> : <FiMenu size={20} />}
                </button>
                <div className="mobile-brand">
                    <img src="/logo.png" alt="Logo" style={{ width: 22, height: 22 }} />
                    <span>Fort Sterling</span>
                </div>
                <button className="theme-toggle-btn mobile" onClick={toggleTheme}>
                    {theme === "dark" ? <FiMoon size={16} /> : <FiSun size={16} />}
                </button>
            </header>

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
                <div className="sidebar-brand">
                    <img src="/logo.png" alt="Logo" style={{ width: 30, height: 30 }} className="brand-icon" />
                    <span className="brand-text">Fort Sterling</span>
                </div>

                <div className="sidebar-user">
                    <div className="user-avatar">
                        {displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="user-info">
                        <span className="user-name">{displayName}</span>
                        <span className="user-email">{user.email}</span>
                    </div>
                </div>

                <nav className="sidebar-nav">
                    <a className={`nav-item ${!isSettingsRoute && !isManageSubscriptionRoute ? "active" : ""}`} href="#" onClick={(e) => { e.preventDefault(); navigate('/'); setSidebarOpen(false); }}>
                        <FiKey size={15} />
                        <span>Credentials</span>
                        <span className="nav-badge">{totalCredentials}</span>
                    </a>
                    {isPro && (
                        <a className={`nav-item ${isManageSubscriptionRoute ? "active" : ""}`} href="#" id="sidebar-manage-plan-btn" onClick={(e) => { e.preventDefault(); navigate('/subscription'); setSidebarOpen(false); }}>
                            <FiCreditCard size={15} />
                            <span>Subscription</span>
                        </a>
                    )}
                    <a className={`nav-item ${isSettingsRoute ? "active" : ""}`} href="#" onClick={(e) => { e.preventDefault(); navigate('/settings'); setSidebarOpen(false); }}>
                        <FiSettings size={15} />
                        <span>Settings</span>
                    </a>
                </nav>

                {/* Plan section */}
                {!isPro && (
                    <div className="sidebar-plan">
                        <button
                            className="auth-submit"
                            onClick={handleOpenPricing}
                            id="sidebar-upgrade-btn"
                            style={{ marginTop: '8px', width: '100%' }}
                        >
                            Upgrade to Pro
                        </button>
                    </div>
                )}

                <div className="sidebar-stats">
                    <div className="stat-card">
                        <span className="stat-value">{totalCredentials}</span>
                        <span className="stat-label">Total Entries</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-value">{new Set(credentials.map(c => c.platform)).size}</span>
                        <span className="stat-label">Platforms</span>
                    </div>
                </div>

                <div className="sidebar-footer">
                    <button className="theme-toggle-btn desktop" onClick={toggleTheme}>
                        {theme === "dark" ? <FiMoon size={14} /> : <FiSun size={14} />}
                        <span>{theme === "dark" ? "Dark" : "Light"}</span>
                    </button>
                    <button className="sign-out-btn desktop" onClick={handleSignOut} disabled={signOutLoading}>
                        <FiLogOut size={14} />
                        <span>{signOutLoading ? "Logging Out..." : "Sign Out"}</span>
                    </button>
                </div>
            </aside>

            {/* Overlay for mobile sidebar */}
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

            {/* Main content area */}
            <main className="main-content">
                {isSettingsRoute ? (
                    <SettingsPage />
                ) : isManageSubscriptionRoute ? (
                    <ManageSubscriptionPage />
                ) : (
                    <>
                        <div className="content-header">
                            <div>
                                <h1 className="page-title">Credentials</h1>
                                <p className="page-subtitle">
                                    {totalCredentials} {totalCredentials === 1 ? "entry" : "entries"} secured
                                </p>
                            </div>
                        </div>

                        <SearchBar value={search} onChange={(val) => { setSearch(val); setCurrentPage(1); }} />

                {loading ? (
                    <div className="credentials-loading">
                        <span className="spinner large" />
                        <p>Decrypting vault…</p>
                    </div>
                ) : filteredCredentials.length === 0 ? (
                    <div className="empty-state">
                        <FiInbox size={40} />
                        <h2>{search ? "No matches" : "Vault is empty"}</h2>
                        <p>
                            {search
                                ? "Try a different search term"
                                : "Tap + to add your first credential"}
                        </p>
                    </div>
                ) : (
                    <>
                    <div className="credentials-grouped">
                        {paginatedPlatforms.map((platformName) => {
                            const key = platformName.toLowerCase();
                            const creds = groupedCredentials.get(key) || [];
                            return (
                                <PlatformGroup
                                    key={key}
                                    platformName={platformName}
                                    credentials={creds}
                                    platforms={platforms}
                                    onEdit={handleEdit}
                                    onDelete={setDeleteTarget}
                                    onHistory={handleHistory}
                                    defaultExpanded={!!search}
                                />
                            );
                        })}
                    </div>
                    {totalPages > 1 && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "20px", width: "95%", margin: "0 auto" }}>
                            <button 
                                className="admin-btn-secondary" 
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            >
                                Previous
                            </button>
                            <span style={{ color: "var(--text-secondary)", fontSize: "0.8rem", fontWeight: "600" }}>
                                Page {currentPage} of {totalPages}
                            </span>
                            <button 
                                className="admin-btn-secondary" 
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
                )}
                </>
                )}
            </main>

            {!isSettingsRoute && !isManageSubscriptionRoute && (
                <FAB
                    onClick={handleAdd}
                    disabled={isAtLimit}
                    title={isAtLimit ? "Upgrade to Pro to add more credentials" : "Add Credential"}
                />
            )}

            {/* Auto-lock warning toast */}
            <CredentialModal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setEditingCredential(null);
                }}
                onSubmit={handleModalSubmit}
                initialData={
                    editingCredential
                        ? { ...editingCredential, id: editingCredential.id }
                        : undefined
                }
                loading={actionLoading}
                existingPlatforms={existingPlatforms}
                platforms={platforms}
                isAtLimit={isAtLimit}
                onUpgrade={() => { setModalOpen(false); setPricingOpen(true); }}
            />

            <HistoryPanel
                isOpen={historyOpen}
                onClose={() => {
                    setHistoryOpen(false);
                    setHistoryCredential(null);
                }}
                credentialId={historyCredential?.id || ""}
                platformName={historyCredential?.platform || ""}
            />

            <ConfirmDialog
                isOpen={!!deleteTarget}
                title="Delete Credential"
                message={`Are you sure you want to delete "${deleteTarget?.platform}"? This cannot be undone.`}
                onConfirm={handleDeleteConfirm}
                onCancel={() => setDeleteTarget(null)}
                loading={actionLoading}
            />

            {/* Pricing / upgrade modal */}
            {pricingOpen && (
                <PricingPage onClose={() => setPricingOpen(false)} />
            )}

            {needsSecurityTerms && (
                <div className="modal-overlay" style={{ zIndex: 9999 }}>
                    <div className="modal-content" style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                <FiInfo style={{ color: 'var(--accent)' }} /> Security & Privacy Terms
                            </h2>
                        </div>
                        <div style={{ fontSize: '0.9rem', lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                            <p style={{ marginBottom: '16px' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>Zero-Knowledge Encryption</strong><br/>
                                Fort Sterling uses zero-knowledge encryption. Your vault is encrypted locally on your device. We can never see or access your passwords.
                            </p>
                            <p style={{ marginBottom: '16px' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>Login vs. Vault Password</strong><br/>
                                Your login and vault passwords start out the same. However, if you ever reset your login password via email, your vault remains securely locked with your old password until you sync them.
                            </p>
                            <p style={{ marginBottom: '0' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>The Recovery Key</strong><br/>
                                Since Fort Sterling does not store your passwords, your <strong>Recovery Key</strong> is your sole backup for account access. Please store it securely, you may update it anytime using your current password.
                            </p>
                        </div>
                        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input 
                                type="checkbox" 
                                id="hideTermsCheckbox" 
                                checked={hideSecurityTermsChecked}
                                onChange={(e) => setHideSecurityTermsChecked(e.target.checked)}
                                style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
                            />
                            <label htmlFor="hideTermsCheckbox" style={{ fontSize: '0.85rem', color: 'var(--text-primary)', cursor: 'pointer', margin: 0 }}>
                                Do not show again.
                            </label>
                        </div>
                        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button 
                                className="auth-submit" 
                                style={{ width: 'auto', margin: 0, padding: '10px 24px' }} 
                                onClick={async () => {
                                    setNeedsSecurityTerms(false);
                                    if (hideSecurityTermsChecked) {
                                        await agreeSecurityTerms();
                                    }
                                }}
                            >
                                I confirm and agree
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Root: wrap App with SubscriptionProvider ─────────────────────────────────
/**
 * Bridge component that renders AppInner inside SubscriptionProvider.
 * Lifts uid and credentialCount state so the provider always has the latest values.
 */
function AppWithSubscription() {
    const [uid, setUid] = useState<string | null>(null);
    const [credentialCount, setCredentialCount] = useState(0);

    return (
        <SubscriptionProvider uid={uid} credentialCount={credentialCount}>
            <AppInner onUidChange={setUid} onCredentialCountChange={setCredentialCount} />
        </SubscriptionProvider>
    );
}

export default AppWithSubscription;
