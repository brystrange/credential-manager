import { useState, useEffect, useCallback, useMemo } from "react";
import { onAuthChange, signOutUser, clearEncryptionKey, hasEncryptionKey } from "./services/authService";
import type { Credential, CredentialInput } from "./services/credentialService";
import {
    getCredentials,
    addCredential,
    updateCredential,
    deleteCredential,
} from "./services/credentialService";
import AuthPage from "./components/AuthPage";
import CredentialModal from "./components/CredentialModal";
import HistoryPanel from "./components/HistoryPanel";
import FAB from "./components/FAB";
import SearchBar from "./components/SearchBar";
import ConfirmDialog from "./components/ConfirmDialog";
import PlatformGroup from "./components/PlatformGroup";
import {
    FiShield,
    FiLogOut,
    FiInbox,
    FiKey,
    FiBarChart2,
    FiMenu,
    FiX,
    FiMoon,
    FiSun,
} from "react-icons/fi";
import type { User } from "firebase/auth";
import { useTheme } from "./context/ThemeContext";

function App() {
    const { theme, toggleTheme } = useTheme();
    const [user, setUser] = useState<User | null | undefined>(undefined);
    const [credentials, setCredentials] = useState<Credential[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Modal states
    const [modalOpen, setModalOpen] = useState(false);
    const [editingCredential, setEditingCredential] = useState<Credential | null>(null);

    // History panel
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyCredential, setHistoryCredential] = useState<Credential | null>(null);

    // Delete confirm
    const [deleteTarget, setDeleteTarget] = useState<Credential | null>(null);

    useEffect(() => {
        const unsub = onAuthChange((u) => {
            setUser(u);
            if (!u) {
                setCredentials([]);
                clearEncryptionKey();
            }
        });
        return unsub;
    }, []);

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

    const handleAuthSuccess = () => {
        loadCredentials();
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
        await signOutUser();
    };

    const filteredCredentials = credentials.filter((c) =>
        c.platform.toLowerCase().includes(search.toLowerCase()) ||
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

    // Loading state
    if (user === undefined) {
        return (
            <div className="app-loading">
                <FiShield size={36} className="pulse" />
                <p>Initializing vault…</p>
            </div>
        );
    }

    // Auth gate
    if (!user) {
        return <AuthPage onAuthSuccess={handleAuthSuccess} />;
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
                    <FiShield size={16} />
                    <span>Fort Knox</span>
                </div>
                <button className="theme-toggle-btn mobile" onClick={toggleTheme}>
                    {theme === "financial" ? <FiMoon size={16} /> : <FiSun size={16} />}
                </button>
                <button className="sign-out-btn mobile" onClick={handleSignOut}>
                    <FiLogOut size={16} />
                </button>
            </header>

            {/* Sidebar */}
            <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
                <div className="sidebar-brand">
                    <FiShield size={20} className="brand-icon" />
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
                        {theme === "financial" ? <FiMoon size={14} /> : <FiSun size={14} />}
                        <span>{theme === "financial" ? "Financial" : "Modern Red"}</span>
                    </button>
                    <button className="sign-out-btn desktop" onClick={handleSignOut}>
                        <FiLogOut size={14} />
                        <span>Sign Out</span>
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
                                    onEdit={handleEdit}
                                    onDelete={setDeleteTarget}
                                    onHistory={handleHistory}
                                    defaultExpanded={platformOrder.length <= 3 || !!search}
                                />
                            );
                        })}
                    </div>
                )}
            </main>

            <FAB onClick={handleAdd} />

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
