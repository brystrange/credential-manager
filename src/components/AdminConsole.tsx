import { useState, useEffect, useCallback } from "react";
import type { Platform, PlatformInput } from "../services/platformService";
import {
    getPlatforms,
    addPlatform,
    updatePlatform,
    deletePlatform,
    getPendingCustomPlatforms,
} from "../services/platformService";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage, auth, db } from "../firebaseConfig";
import { getIdTokenResult } from "firebase/auth";
import {
    FiPlus,
    FiEdit2,
    FiTrash2,
    FiX,
    FiArrowLeft,
    FiSave,
    FiExternalLink,
    FiUpload,
    FiImage,
    FiAlertTriangle,
    FiUsers,
    FiLayers,
    FiChevronDown,
    FiChevronRight,
    FiSearch,
    FiMenu,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { collection, doc, setDoc, deleteDoc, getDocs, query, where } from "firebase/firestore";

export default function AdminConsole() {
    const navigate = useNavigate();
    const [authenticated, setAuthenticated] = useState(false);
    const [accessDenied, setAccessDenied] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [loading, setLoading] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<"platforms" | "exemptions" | "pending">("platforms");
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Pending Logos state
    const [pendingPlatforms, setPendingPlatforms] = useState<{ name: string; count: number }[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);
    // Search, filter, pagination, accordion state
    const [searchQuery, setSearchQuery] = useState("");
    const [filterCategory, setFilterCategory] = useState("All");
    const [currentPage, setCurrentPage] = useState(1);
    const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
    const ITEMS_PER_PAGE = 50;

    // Exemptions state
    const [exemptions, setExemptions] = useState<{ email: string; addedBy: string; addedAt: Date }[]>([]);
    const [exemptEmail, setExemptEmail] = useState("");
    const [loadingExemptions, setLoadingExemptions] = useState(false);

    // Form fields
    const [formName, setFormName] = useState("");
    const [formColor, setFormColor] = useState("#6366f1");
    const [formCategory, setFormCategory] = useState("");
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [formLogoUrl, setFormLogoUrl] = useState("");
    const [formLink, setFormLink] = useState("");
    const [uploading, setUploading] = useState(false);
    const [logoToDelete, setLogoToDelete] = useState<string>("");
    const [originalLogoUrl, setOriginalLogoUrl] = useState<string>("");

    // The sole admin email — also checked as a fallback before custom claims are set
    const ADMIN_EMAIL = "bryankeithmayor1@gmail.com";

    // ─── Admin authentication via Firebase custom claims ─────────────────────
    useEffect(() => {
        const checkAdmin = async () => {
            setCheckingAuth(true);
            const user = auth.currentUser;
            if (!user) {
                setAccessDenied(true);
                setCheckingAuth(false);
                return;
            }

            try {
                // Force refresh to get latest claims
                const tokenResult = await getIdTokenResult(user, true);

                // Grant access if the user has the admin custom claim OR matches the known admin email
                if (tokenResult.claims.admin === true || user.email === ADMIN_EMAIL) {

                    // Auto-bootstrap the custom claim if the user doesn't have it yet
                    // This fixes the 403 Forbidden errors when calling the Cloud Functions
                    if (tokenResult.claims.admin !== true && user.email === ADMIN_EMAIL) {
                        try {
                            const { httpsCallable } = await import("firebase/functions");
                            const { functions } = await import("../firebaseConfig");
                            const fn = httpsCallable(functions, "setAdminClaim");
                            await fn();
                            // Force refresh the token immediately so the new claim is attached
                            await user.getIdToken(true);
                        } catch (bootstrapErr) {
                            console.warn("Failed to auto-bootstrap admin claim:", bootstrapErr);
                        }
                    }

                    setAuthenticated(true);
                    setAccessDenied(false);
                } else {
                    setAccessDenied(true);
                }
            } catch (err) {
                console.error("Failed to check admin claims:", err);
                // Still allow the known admin email even if token refresh fails
                if (user.email === ADMIN_EMAIL) {
                    setAuthenticated(true);
                    setAccessDenied(false);
                } else {
                    setAccessDenied(true);
                }
            } finally {
                setCheckingAuth(false);
            }
        };

        // Wait a moment for Firebase auth state to be ready
        const unsubscribe = auth.onAuthStateChanged(() => {
            checkAdmin();
        });

        return () => unsubscribe();
    }, []);

    const loadPlatforms = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPlatforms();
            setPlatforms(data);
        } catch (err) {
            console.error("Failed to load platforms:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (authenticated) {
            loadPlatforms();
            loadExemptions();
        }
    }, [authenticated, loadPlatforms]);

    const loadExemptions = async () => {
        setLoadingExemptions(true);
        try {
            const snap = await getDocs(collection(db, "exemptions"));
            const items = snap.docs.map(d => {
                const data = d.data();
                return {
                    email: d.id,
                    addedBy: data.addedBy || "",
                    addedAt: data.addedAt ? data.addedAt.toDate() : new Date()
                };
            });
            setExemptions(items);
        } catch (err) {
            console.error("Failed to load exemptions:", err);
        } finally {
            setLoadingExemptions(false);
        }
    };

    const handleAddExemption = async (e: React.FormEvent) => {
        e.preventDefault();
        const email = exemptEmail.trim().toLowerCase();
        if (!email) return;

        setSaving(true);
        try {
            // Validate that the email belongs to a registered user
            const usersQuery = query(collection(db, "users"), where("email", "==", email));
            const usersSnap = await getDocs(usersQuery);
            if (usersSnap.empty) {
                alert(`No registered account found for "${email}". Only existing users can be exempted.`);
                setSaving(false);
                return;
            }

            await setDoc(doc(db, "exemptions", email), {
                exempt: true,
                addedBy: auth.currentUser?.email || ADMIN_EMAIL,
                addedAt: new Date()
            });
            setExemptEmail("");
            await loadExemptions();
        } catch (err) {
            console.error("Failed to add exemption:", err);
            alert("Failed to add exemption. Ensure you have admin rights.");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteExemption = async (email: string) => {
        setSaving(true);
        try {
            await deleteDoc(doc(db, "exemptions", email));
            await loadExemptions();
        } catch (err) {
            console.error("Failed to remove exemption:", err);
        } finally {
            setSaving(false);
            setDeleteConfirm(null);
        }
    };

    const handleScanPendingLogos = async () => {
        setLoadingPending(true);
        try {
            const data = await getPendingCustomPlatforms();
            setPendingPlatforms(data);
        } catch (err) {
            console.error("Failed to scan pending platforms:", err);
            alert("Failed to scan for pending platforms. Check console for details.");
        } finally {
            setLoadingPending(false);
        }
    };

    /** Extract the Firebase Storage object path from a download URL */
    const getStoragePath = (url: string): string | null => {
        try {
            const urlObj = new URL(url);
            if (!urlObj.hostname.includes("firebasestorage.googleapis.com")) return null;
            const match = urlObj.pathname.match(/\/o\/(.+)/);
            return match ? decodeURIComponent(match[1]) : null;
        } catch {
            return null;
        }
    };

    /** Delete a file from Firebase Storage by its download URL (silently ignores errors) */
    const deleteStorageFile = async (url: string) => {
        const path = getStoragePath(url);
        if (!path) return;
        try {
            await deleteObject(ref(storage, path));
        } catch (err: any) {
            if (err?.code !== "storage/object-not-found") {
                console.warn("Failed to delete old logo from Storage:", err);
            }
        }
    };

    const resetForm = () => {
        setFormName("");
        setFormColor("#6366f1");
        setFormCategory("");
        setIsCreatingCategory(false);
        setFormLogoUrl("");
        setFormLink("");
        setEditingPlatform(null);
        setFormOpen(false);
        setLogoToDelete("");
        setOriginalLogoUrl("");
    };

    const openAddForm = () => {
        resetForm();
        setFormOpen(true);
    };

    const openEditForm = (p: Platform) => {
        setEditingPlatform(p);
        setFormName(p.name);
        setFormColor(p.color);
        setFormCategory(p.category);
        setIsCreatingCategory(false);
        setFormLogoUrl(p.logoUrl);
        setFormLink(p.link || p.domain);
        setOriginalLogoUrl(p.logoUrl);
        setLogoToDelete("");
        setFormOpen(true);
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName.trim()) return;

        let derivedDomain = "";
        const rawLink = formLink.trim();
        if (rawLink) {
            try {
                const url = new URL(rawLink.startsWith("http") ? rawLink : `https://${rawLink}`);
                derivedDomain = url.hostname.replace(/^www\./, "");
            } catch {
                derivedDomain = rawLink;
            }
        }

        const normalizedLink = rawLink && !rawLink.startsWith("http")
            ? `https://${rawLink}`
            : rawLink;

        const input: PlatformInput = {
            name: formName.trim(),
            domain: derivedDomain,
            color: formColor,
            category: formCategory.trim() || "Other",
            logoUrl: formLogoUrl,
            link: normalizedLink,
        };

        setSaving(true);
        try {
            if (editingPlatform) {
                await updatePlatform(editingPlatform.id, input);
                if (logoToDelete) {
                    await deleteStorageFile(logoToDelete);
                }
            } else {
                await addPlatform(input);
            }
            resetForm();
            await loadPlatforms();
        } catch (err) {
            console.error("Failed to save platform:", err);
        } finally {
            setSaving(false);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const ext = file.name.split(".").pop()?.toLowerCase() || "png";

            let filename: string;
            if (editingPlatform) {
                filename = `platform-logos/${editingPlatform.id}.${ext}`;

                if (formLogoUrl && formLogoUrl !== originalLogoUrl) {
                    // Already scheduled
                } else if (formLogoUrl && getStoragePath(formLogoUrl)) {
                    const currentPath = getStoragePath(formLogoUrl);
                    if (currentPath && currentPath !== filename) {
                        setLogoToDelete(formLogoUrl);
                    }
                }
            } else {
                const slug = formName.trim()
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/[^a-z0-9-]/g, "")
                    || "platform";
                filename = `platform-logos/${slug}.${ext}`;
            }

            const storageRef = ref(storage, filename);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            setFormLogoUrl(url);
        } catch (err) {
            console.error("Failed to upload logo:", err);
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const handleDelete = async (id: string) => {
        setSaving(true);
        try {
            await deletePlatform(id);
            setDeleteConfirm(null);
            await loadPlatforms();
        } catch (err) {
            console.error("Failed to delete platform:", err);
        } finally {
            setSaving(false);
        }
    };

    // ─── Loading state ───────────────────────────────────────────────────────
    if (checkingAuth) {
        return (
            <div className="admin-gate">
                <div className="admin-gate-card">
                    <div className="admin-gate-icon">
                        <img src="/logo.png" alt="Logo" style={{ width: 40, height: 40 }} />
                    </div>
                    <h1>Admin Console</h1>
                    <p className="admin-gate-sub">Verifying access…</p>
                    <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                        <span className="spinner large" />
                    </div>
                </div>
            </div>
        );
    }

    // ─── Access denied gate ──────────────────────────────────────────────────
    if (accessDenied || !authenticated) {
        return (
            <div className="admin-gate">
                <div className="admin-gate-card">
                    <div className="admin-gate-icon" style={{ color: "#ffffffff" }}>
                        <FiAlertTriangle size={40} />
                    </div>
                    <h1>Access Denied</h1>
                    <p className="admin-gate-sub">
                        {!auth.currentUser
                            ? "You must be signed in to access the admin console."
                            : "Your account does not have admin privileges."}
                    </p>
                    <button
                        className="admin-gate-btn"
                        onClick={() => navigate("/")}
                        style={{ marginTop: 16 }}
                    >
                        Back to Vault
                    </button>
                </div>
            </div>
        );
    }

    // ─── Admin panel ─────────────────────────────────────────────────────────
    const filteredPlatforms = platforms.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = filterCategory === "All" || (p.category || "Other") === filterCategory;
        return matchesSearch && matchesCategory;
    });

    const totalPages = Math.ceil(filteredPlatforms.length / ITEMS_PER_PAGE) || 1;
    const paginatedPlatforms = filteredPlatforms.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const groupedByCategory = paginatedPlatforms.reduce<Record<string, Platform[]>>((acc, p) => {
        const cat = p.category || "Other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(p);
        return acc;
    }, {});

    const allCategories = Array.from(new Set(platforms.map(p => p.category || "Other"))).sort();

    const toggleCategory = (cat: string) => {
        setExpandedCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const expandAll = () => setExpandedCategories(Object.keys(groupedByCategory));
    const collapseAll = () => setExpandedCategories([]);

    return (
        <div className="admin-shell">
            {sidebarOpen && <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
            <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
                <header className="admin-title-group" style={{ padding: "24px 20px" }}>
                    <img src="/logo.png" alt="Logo" style={{ width: 22, height: 22 }} />
                    <h1 style={{ fontSize: "1.2rem", margin: 0 }}>Admin</h1>
                </header>
                <nav className="admin-sidebar-nav">
                    <button 
                        className={`admin-sidebar-tab ${activeTab === "platforms" ? "active" : ""}`}
                        onClick={() => { setActiveTab("platforms"); setSidebarOpen(false); }}
                    >
                        <FiLayers size={16} />
                        <span>Platforms</span>
                    </button>
                    <button 
                        className={`admin-sidebar-tab ${activeTab === "exemptions" ? "active" : ""}`}
                        onClick={() => { setActiveTab("exemptions"); setSidebarOpen(false); }}
                    >
                        <FiUsers size={16} />
                        <span>Exemptions</span>
                    </button>
                    <button 
                        className={`admin-sidebar-tab ${activeTab === "pending" ? "active" : ""}`}
                        onClick={() => { setActiveTab("pending"); setSidebarOpen(false); }}
                    >
                        <FiImage size={16} />
                        <span>Pending Logo</span>
                    </button>
                </nav>
                <div style={{ padding: "20px" }}>
                    <button 
                        className="admin-back-btn" 
                        onClick={() => navigate("/")}
                        style={{ width: "100%", justifyContent: "center" }}
                    >
                        <FiArrowLeft size={16} />
                        <span>Back to Vault</span>
                    </button>
                </div>
            </aside>

            <div className="admin-content">
                {activeTab === "platforms" && (
                    <>
                        <header className="admin-header">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <button className="admin-menu-btn" onClick={() => setSidebarOpen(true)}>
                                    <FiMenu size={20} />
                                </button>
                                <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Platforms</h2>
                            </div>
                            <button className="admin-add-btn" onClick={openAddForm}>
                                <FiPlus size={16} />
                                <span>Add Platform</span>
                            </button>
                        </header>
                        <main className="admin-content-main">
                            <div className="admin-content-body">
                            {/* Search and Filters */}
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
                                    <FiSearch size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                    <input 
                                        type="text" 
                                        placeholder="Search platforms..." 
                                        value={searchQuery}
                                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                        style={{ width: '100%', padding: "8px 10px 8px 32px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)", fontSize: "0.85rem", boxSizing: "border-box" }}
                                    />
                                </div>
                                <select 
                                    className="admin-filter-select"
                                    value={filterCategory} 
                                    onChange={e => { setFilterCategory(e.target.value); setCurrentPage(1); }}
                                >
                                    <option value="All">All Categories</option>
                                    {allCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Add / Edit form */}
                            {formOpen && (
                                <div className="admin-form-overlay" onClick={resetForm}>
                                    <div className="admin-form-card" onClick={(e) => e.stopPropagation()}>
                                        <div className="admin-form-header">
                                            <h2>{editingPlatform ? "Edit Platform" : "Add Platform"}</h2>
                                            <button className="admin-form-close" onClick={resetForm}>
                                                <FiX size={18} />
                                            </button>
                                        </div>
                                        <form onSubmit={handleFormSubmit} className="admin-form">
                                            <div className="admin-form-row">
                                                <label>Name *</label>
                                                <input
                                                    type="text"
                                                    value={formName}
                                                    onChange={(e) => setFormName(e.target.value)}
                                                    placeholder="e.g. Google"
                                                    required
                                                />
                                            </div>
                                            <div className="admin-form-row">
                                                <label>Category</label>
                                                {isCreatingCategory ? (
                                                    <div style={{ display: "flex", gap: "8px" }}>
                                                        <input
                                                            type="text"
                                                            value={formCategory}
                                                            onChange={(e) => setFormCategory(e.target.value)}
                                                            placeholder="New category name"
                                                            autoFocus
                                                            style={{ flex: 1 }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setIsCreatingCategory(false);
                                                                setFormCategory("");
                                                            }}
                                                            style={{ padding: "8px 12px", background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", cursor: "pointer", fontSize: "0.85rem" }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <select
                                                        value={formCategory}
                                                        onChange={(e) => {
                                                            if (e.target.value === "__CREATE_NEW__") {
                                                                setIsCreatingCategory(true);
                                                                setFormCategory("");
                                                            } else {
                                                                setFormCategory(e.target.value);
                                                            }
                                                        }}
                                                    >
                                                        <option value="" disabled>Select a category</option>
                                                        <option value="__CREATE_NEW__">+ Create category</option>
                                                        {allCategories.map(cat => (
                                                            <option key={cat} value={cat}>{cat}</option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                            <div className="admin-form-row">
                                                <label>Brand Color</label>
                                                <div className="admin-color-input">
                                                    <input
                                                        type="color"
                                                        value={formColor}
                                                        onChange={(e) => setFormColor(e.target.value)}
                                                    />
                                                    <span className="admin-color-hex">{formColor}</span>
                                                </div>
                                            </div>

                                            {/* Logo Upload */}
                                            <div className="admin-form-row">
                                                <label>
                                                    <FiImage size={13} style={{ marginRight: 4 }} />
                                                    Logo
                                                </label>
                                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                                    {formLogoUrl && (
                                                        <div className="admin-logo-preview" style={{ margin: 0 }}>
                                                            <img
                                                                src={formLogoUrl}
                                                                alt="Preview"
                                                                onError={(e) => (e.currentTarget.style.display = "none")}
                                                            />
                                                        </div>
                                                    )}
                                                    <label style={{
                                                        display: "inline-flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        padding: "8px 14px",
                                                        background: uploading ? "var(--bg-input)" : "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                                                        color: "#fff",
                                                        borderRadius: "var(--radius-sm)",
                                                        cursor: uploading ? "not-allowed" : "pointer",
                                                        fontSize: "0.83rem",
                                                        fontWeight: 600,
                                                        opacity: uploading ? 0.7 : 1,
                                                        transition: "all var(--transition)",
                                                        flexShrink: 0,
                                                    }}>
                                                        <FiUpload size={13} />
                                                        {uploading ? "Uploading..." : formLogoUrl ? "Change" : "Upload Logo"}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleLogoUpload}
                                                            style={{ display: "none" }}
                                                            disabled={uploading}
                                                        />
                                                    </label>
                                                    {formLogoUrl && !uploading && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (getStoragePath(formLogoUrl)) {
                                                                    setLogoToDelete(formLogoUrl);
                                                                }
                                                                setFormLogoUrl("");
                                                            }}
                                                            style={{
                                                                padding: "7px 11px",
                                                                background: "rgba(248,81,73,0.1)",
                                                                color: "var(--danger)",
                                                                border: "1px solid rgba(248,81,73,0.2)",
                                                                borderRadius: "var(--radius-sm)",
                                                                fontSize: "0.8rem",
                                                                cursor: "pointer",
                                                            }}
                                                        >
                                                            Remove
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Website / Link */}
                                            <div className="admin-form-row">
                                                <label>
                                                    <FiExternalLink size={13} style={{ marginRight: 4 }} />
                                                    Website
                                                </label>
                                                <input
                                                    type="text"
                                                    value={formLink}
                                                    onChange={(e) => setFormLink(e.target.value)}
                                                    placeholder="https://google.com"
                                                />
                                            </div>
                                            <button type="submit" className="admin-form-submit" disabled={saving || !formName.trim()}>
                                                {saving ? "Saving..." : (
                                                    <>
                                                        <FiSave size={14} />
                                                        <span>{editingPlatform ? "Save Changes" : "Add Platform"}</span>
                                                    </>
                                                )}
                                            </button>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {loading ? (
                                <div className="admin-loading">
                                    <span className="spinner large" />
                                    <p>Loading platforms…</p>
                                </div>
                            ) : platforms.length === 0 ? (
                                <div className="admin-empty">
                                    <img src="/logo.png" alt="Logo" style={{ width: 40, height: 40 }} />
                                    <h2>No platforms yet</h2>
                                    <p>Add your first platform to get started</p>
                                    <button className="admin-add-btn" onClick={openAddForm}>
                                        <FiPlus size={16} />
                                        <span>Add Platform</span>
                                    </button>
                                </div>
                            ) : (
                                <div className="admin-platform-list">
                                    <div className="admin-stats-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <span>{filteredPlatforms.length} platform{filteredPlatforms.length !== 1 ? "s" : ""}</span>
                                            {searchQuery || filterCategory !== "All" ? <span> (filtered)</span> : null}
                                        </div>
                                        <div style={{ display: 'flex', gap: '16px' }}>
                                            <button onClick={expandAll} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Expand All</button>
                                            <button onClick={collapseAll} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}>Collapse All</button>
                                        </div>
                                    </div>
                                    {Object.entries(groupedByCategory).map(([cat, items]) => {
                                        const isExpanded = expandedCategories.includes(cat);
                                        return (
                                        <div key={cat} className="admin-category-group" style={{ marginBottom: "24px" }}>
                                            <div 
                                                className="admin-category-header"
                                                onClick={() => toggleCategory(cat)}
                                                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", cursor: "pointer" }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                    {isExpanded ? <FiChevronDown size={16} /> : <FiChevronRight size={16} />}
                                                    <h3 className="admin-category-label" style={{ margin: 0, paddingLeft: "4px" }}>{cat} ({items.length})</h3>
                                                </div>
                                            </div>
                                            {isExpanded && (
                                            <div className="admin-platform-cards" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {items.map((p) => (
                                                    <div key={p.id} className="admin-platform-card">
                                                        <div className="admin-platform-left">
                                                            {p.logoUrl ? (
                                                                <img
                                                                    src={p.logoUrl}
                                                                    alt={p.name}
                                                                    className="admin-platform-logo"
                                                                    onError={(e) => (e.currentTarget.style.display = "none")}
                                                                />
                                                            ) : (
                                                                <div
                                                                    className="admin-platform-initial"
                                                                    style={{ backgroundColor: p.color }}
                                                                >
                                                                    {p.name.charAt(0).toUpperCase()}
                                                                </div>
                                                            )}
                                                            <div className="admin-platform-info">
                                                                <span className="admin-platform-name">{p.name}</span>
                                                                <span className="admin-platform-domain">
                                                                    {p.domain || (p.link ? (() => { try { return new URL(p.link).hostname.replace(/^www\./, ""); } catch { return p.link; } })() : "")}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="admin-platform-actions">
                                                            {p.link && (
                                                                <a
                                                                    href={p.link}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="admin-icon-btn"
                                                                    title="Open link"
                                                                >
                                                                    <FiExternalLink size={14} />
                                                                </a>
                                                            )}
                                                            <button
                                                                className="admin-icon-btn"
                                                                onClick={() => openEditForm(p)}
                                                                title="Edit"
                                                                disabled={saving}
                                                            >
                                                                <FiEdit2 size={14} />
                                                            </button>
                                                            {deleteConfirm === p.id ? (
                                                                <div className="admin-delete-confirm">
                                                                    <button
                                                                        className="admin-icon-btn danger"
                                                                        onClick={() => handleDelete(p.id)}
                                                                        title="Confirm delete"
                                                                        disabled={saving}
                                                                    >
                                                                        {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <FiTrash2 size={14} />}
                                                                    </button>
                                                                    <button
                                                                        className="admin-icon-btn"
                                                                        onClick={() => setDeleteConfirm(null)}
                                                                        title="Cancel"
                                                                        disabled={saving}
                                                                    >
                                                                        <FiX size={14} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    className="admin-icon-btn danger"
                                                                    onClick={() => setDeleteConfirm(p.id)}
                                                                    title="Delete"
                                                                >
                                                                    <FiTrash2 size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            )}
                                        </div>
                                    )})}

                                    {/* Pagination Controls */}
                                    {totalPages > 1 && (
                                        <div className="admin-pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginTop: '24px', padding: '16px 0', borderTop: '1px solid var(--border-color)' }}>
                                            <button 
                                                disabled={currentPage === 1} 
                                                onClick={() => setCurrentPage(p => p - 1)}
                                                style={{ padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)", cursor: currentPage === 1 ? "not-allowed" : "pointer", opacity: currentPage === 1 ? 0.5 : 1 }}
                                            >
                                                Previous
                                            </button>
                                            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Page {currentPage} of {totalPages}</span>
                                            <button 
                                                disabled={currentPage === totalPages} 
                                                onClick={() => setCurrentPage(p => p + 1)}
                                                style={{ padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", background: "var(--bg-secondary)", color: "var(--text-primary)", cursor: currentPage === totalPages ? "not-allowed" : "pointer", opacity: currentPage === totalPages ? 0.5 : 1 }}
                                            >
                                                Next
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            </div>
                        </main>
                    </>
                )}

                {activeTab === "exemptions" && (
                    <>
                        <header className="admin-header">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <button className="admin-menu-btn" onClick={() => setSidebarOpen(true)}>
                                    <FiMenu size={20} />
                                </button>
                                <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Exemptions</h2>
                            </div>
                        </header>
                        <main className="admin-content-main">
                            <div className="admin-content-body">
                            <form onSubmit={handleAddExemption} style={{ display: "flex", gap: "8px", marginBottom: "20px", background: "var(--bg-secondary)", padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                                <input
                                    type="email"
                                    placeholder="Enter email to exempt"
                                    value={exemptEmail}
                                    onChange={(e) => setExemptEmail(e.target.value)}
                                    style={{ flex: 1, padding: "7px 10px", fontSize: "0.78rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                                    required
                                />
                                <button type="submit" disabled={saving || !exemptEmail.trim()} className="admin-add-btn">
                                    <FiPlus size={13} />
                                    <span>Add Exemption</span>
                                </button>
                            </form>

                            {loadingExemptions ? (
                                <div className="admin-loading">
                                    <span className="spinner large" />
                                    <p>Loading exemptions…</p>
                                </div>
                            ) : exemptions.length === 0 ? (
                                <div className="admin-empty">
                                    <FiUsers size={40} style={{ color: "var(--text-secondary)", marginBottom: 10 }} />
                                    <h2>No Exemptions</h2>
                                    <p>No users are currently exempted from subscriptions.</p>
                                </div>
                            ) : (
                                <div className="admin-platform-cards" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {exemptions.map(ex => (
                                        <div key={ex.email} className="admin-platform-card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <div>
                                                <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.82rem" }}>{ex.email}</div>
                                                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 2 }}>
                                                    Added by {ex.addedBy} • {ex.addedAt.toLocaleDateString()}
                                                </div>
                                            </div>
                                            <div>
                                                {deleteConfirm === ex.email ? (
                                                    <div className="admin-delete-confirm">
                                                        <button
                                                            className="admin-icon-btn danger"
                                                            onClick={() => handleDeleteExemption(ex.email)}
                                                            title="Confirm delete"
                                                            disabled={saving}
                                                        >
                                                            {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <FiTrash2 size={14} />}
                                                        </button>
                                                        <button
                                                            className="admin-icon-btn"
                                                            onClick={() => setDeleteConfirm(null)}
                                                            title="Cancel"
                                                            disabled={saving}
                                                        >
                                                            <FiX size={14} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        className="admin-icon-btn danger"
                                                        onClick={() => setDeleteConfirm(ex.email)}
                                                        title="Revoke Exemption"
                                                    >
                                                        <FiTrash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            </div>
                        </main>
                    </>
                )}

                {activeTab === "pending" && (
                    <>
                        <header className="admin-header">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <button className="admin-menu-btn" onClick={() => setSidebarOpen(true)}>
                                    <FiMenu size={20} />
                                </button>
                                <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Pending Logos</h2>
                            </div>
                            <button
                                className="admin-add-btn"
                                onClick={handleScanPendingLogos}
                                disabled={loadingPending}
                            >
                                {loadingPending ? <span className="spinner small" /> : <FiSearch size={16} />}
                                <span>Scan for Pending Logos</span>
                            </button>
                        </header>
                        <main className="admin-content-main">
                            <div className="admin-content-body">
                                {loadingPending ? (
                                    <div className="admin-loading">
                                        <span className="spinner large" />
                                        <p>Scanning all credentials (this may take a moment)…</p>
                                    </div>
                                ) : pendingPlatforms.length === 0 ? (
                                    <div className="admin-empty">
                                        <FiImage size={40} style={{ color: "var(--text-secondary)", marginBottom: 10 }} />
                                        <h2>No Pending Logos</h2>
                                        <p>Click "Scan" to find custom platforms added by users.</p>
                                    </div>
                                ) : (
                                    <div className="admin-platform-cards" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        {pendingPlatforms.map(p => (
                                            <div key={p.name} className="admin-platform-card" style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "0.82rem" }}>{p.name}</div>
                                                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: 2 }}>
                                                        Used by {p.count} credential{p.count !== 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                                <button
                                                    className="admin-icon-btn"
                                                    onClick={() => {
                                                        setActiveTab("platforms");
                                                        setFormName(p.name);
                                                        setFormCategory("Other");
                                                        setFormColor("#6366f1");
                                                        setFormLogoUrl("");
                                                        setFormLink("");
                                                        setEditingPlatform(null);
                                                        setFormOpen(true);
                                                    }}
                                                    title="Add Platform"
                                                >
                                                    <FiPlus size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </main>
                    </>
                )}
            </div>
        </div>
    );
}