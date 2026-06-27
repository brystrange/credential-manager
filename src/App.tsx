import { useState, useEffect, useCallback, useMemo } from "react";
import { onAuthChange, signOutUser, clearEncryptionKey, hasEncryptionKey, unlockVaultWithPassword, setupGoogleVault } from "./services/authService";
import { useAutoLock } from "./hooks/useAutoLock";
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
import CredentialModal from "./components/CredentialModal";
import HistoryPanel from "./components/HistoryPanel";
import FAB from "./components/FAB";
import SearchBar from "./components/SearchBar";
import ConfirmDialog from "./components/ConfirmDialog";
import PlatformGroup from "./components/PlatformGroup";
import {
    FiLogOut,
    FiInbox,
    FiKey,
    FiBarChart2,
    FiMenu,
    FiX,
    FiMoon,
    FiSun,
    FiLock,
    FiEye,
    FiEyeOff,
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
                <img src="/logo.svg" alt="Logo" style={{ width: 52, height: 52 }} />
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
}: {
    userEmail: string;
    onSetup: (password: string) => Promise<void>;
}) {
    const [pw, setPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [showPw, setShowPw] = useState(false);
    const [showConfirmPw, setShowConfirmPw] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const MIN_BUSY_MS = 600;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (pw.length < 6) { setError("Password must be at least 6 characters."); return; }
        if (pw !== confirmPw) { setError("Passwords do not match."); return; }
        setError("");
        setBusy(true);
        const t0 = Date.now();
        try {
            await onSetup(pw);
        } catch {
            setError("Failed to set up vault. Please try again.");
        } finally {
            const gap = MIN_BUSY_MS - (Date.now() - t0);
            if (gap > 0) await new Promise((r) => setTimeout(r, gap));
            setBusy(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">
                        <img src="/logo.svg" alt="Logo" style={{ width: 32, height: 32 }} />
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
                        <p>This password encrypts your credentials. Keep it safe — it cannot be recovered.</p>
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
                        {busy ? "Setting Up..." : "Set Up Vault"}
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

    const MIN_BUSY_MS = 600;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setBusy(true);
        const t0 = Date.now();
        try {
            await unlockVaultWithPassword(pw);
            onUnlocked();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "";
            if (msg.includes("Invalid vault password") || msg.includes("decryption")) {
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

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">
                        <img src="/logo.svg" alt="Logo" style={{ width: 32, height: 32 }} />
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
                        style={{ marginTop: "12px", background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)" }}
                        onClick={() => signOutUser()}
                    >
                        Sign out & Reset Password
                    </button>
                </form>

            </div>
        </div>
    );
}

function App() {
    const { theme, toggleTheme } = useTheme();
    const [user, setUser] = useState<User | null | undefined>(undefined);

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
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [signOutLoading, setSignOutLoading] = useState(false);

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCredential, setEditingCredential] = useState<Credential | null>(null);

    // History panel
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyCredential, setHistoryCredential] = useState<Credential | null>(null);

    // Auto-lock warning
    const [autoLockWarning, setAutoLockWarning] = useState(false);

    // Auto-lock hook — locks after 1 hour of inactivity
    useAutoLock({
        enabled: vaultUnlocked && !!user,
        timeoutMs: 60 * 60 * 1000, // 1 hour
        warningBeforeMs: 30_000,    // 30 seconds warning
        onLock: async () => {
            setAutoLockWarning(false);
            clearEncryptionKey();
            await signOutUser();
        },
        onWarning: () => {
            setAutoLockWarning(true);
        },
    });

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);

    useEffect(() => {
        const unsub = onAuthChange((u) => {
            // Block unverified users
            if (u && !u.emailVerified) {
                signOutUser();
                return;
            }
            setUser(u);
            if (!u) {
                setCredentials([]);
                setVaultUnlocked(false);
                clearEncryptionKey();
            }
        });
        return unsub;
    }, []);

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
        } catch (err) {
            console.error("Failed to load credentials:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Called after a successful login OR after vault unlock on page reload
    const handleAuthSuccess = () => {
        setLoginInProgress(false);
        setVaultUnlocked(true);
        setShowWelcome(true);
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
        await setupGoogleVault(password);
        setIsNewGoogleUser(false);
        handleAuthSuccess();
    };

    const handleAdd = () => {
        setEditingCredential(null);
        setModalOpen(true);
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
                <img src="/logo.svg" alt="Logo" style={{ width: 36, height: 36 }} className="pulse" />
                <p>Initializing vault…</p>
            </div>
        );
    }

    // Not signed in
    if (!user) {
        return (
            <AuthPage
                onAuthSuccess={handleAuthSuccess}
                onAuthStart={handleAuthStart}
                onAuthEnd={handleAuthEnd}
                onNewGoogleUser={handleNewGoogleUser}
            />
        );
    }

    // New Google user — has Firebase auth but no Firestore record yet.
    // Show vault setup so they can create their encryption password.
    if (isNewGoogleUser) {
        return (
            <GoogleVaultSetup
                userEmail={user.email ?? ""}
                onSetup={handleGoogleVaultSetup}
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

    return (
        <div className="app-shell">
            {/* Mobile header bar */}
            <header className="mobile-header">
                <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
                    {sidebarOpen ? <FiX size={20} /> : <FiMenu size={20} />}
                </button>
                <div className="mobile-brand">
                    <img src="/logo.svg" alt="Logo" style={{ width: 22, height: 22 }} />
                    <span>Fort Knox</span>
                </div>
                <button className="theme-toggle-btn mobile" onClick={toggleTheme}>
                    {theme === "dark" ? <FiMoon size={16} /> : <FiSun size={16} />}
                </button>
            </header>

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
                <div className="sidebar-brand">
                    <img src="/logo.svg" alt="Logo" style={{ width: 30, height: 30 }} className="brand-icon" />
                    <span className="brand-text">Fort Knox</span>
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
                    <a className="nav-item active" href="#" onClick={(e) => { e.preventDefault(); setSidebarOpen(false); }}>
                        <FiKey size={15} />
                        <span>Credentials</span>
                        <span className="nav-badge">{totalCredentials}</span>
                    </a>
                    <a className="nav-item" href="#" onClick={(e) => e.preventDefault()}>
                        <FiBarChart2 size={15} />
                        <span>Overview</span>
                    </a>
                </nav>

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
                <div className="content-header">
                    <div>
                        <h1 className="page-title">Credentials</h1>
                        <p className="page-subtitle">
                            {totalCredentials} {totalCredentials === 1 ? "entry" : "entries"} secured
                        </p>
                    </div>
                </div>

                <SearchBar value={search} onChange={setSearch} />

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
                    <div className="credentials-grouped">
                        {platformOrder.map((platformName) => {
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
                )}
            </main>

            <FAB onClick={handleAdd} />

            {/* Auto-lock warning toast */}
            {autoLockWarning && (
                <div className="auto-lock-warning" style={{
                    position: "fixed",
                    bottom: 90,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                    color: "#fff",
                    padding: "12px 24px",
                    borderRadius: 12,
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                    zIndex: 9999,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    animation: "fadeIn 0.3s ease",
                }}>
                    <FiLock size={16} />
                    Vault will auto-lock in 30 seconds due to inactivity
                </div>
            )}

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
        </div>
    );
}

export default App;