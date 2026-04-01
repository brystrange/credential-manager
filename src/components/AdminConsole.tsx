import { useState, useEffect, useCallback } from "react";
import type { Platform, PlatformInput } from "../services/platformService";
import {
    getPlatforms,
    addPlatform,
    updatePlatform,
    deletePlatform,
} from "../services/platformService";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage, auth } from "../firebaseConfig";
import { getIdTokenResult } from "firebase/auth";
import {
    FiShield,
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
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";

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

    // Form fields
    const [formName, setFormName] = useState("");
    const [formColor, setFormColor] = useState("#6366f1");
    const [formCategory, setFormCategory] = useState("");
    const [formLogoUrl, setFormLogoUrl] = useState("");
    const [formLink, setFormLink] = useState("");
    const [uploading, setUploading] = useState(false);
    const [logoToDelete, setLogoToDelete] = useState<string>("");
    const [originalLogoUrl, setOriginalLogoUrl] = useState<string>("");

    // The sole admin UID — also checked as a fallback before custom claims are set
    const ADMIN_UID = "NGq845EEJEMDZKKAPZMaSxznt5p2";

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

                // Grant access if the user has the admin custom claim OR matches the known admin UID
                if (tokenResult.claims.admin === true || user.uid === ADMIN_UID) {

                    // Auto-bootstrap the custom claim if the user doesn't have it yet
                    // This fixes the 403 Forbidden errors when calling the Cloud Functions
                    if (tokenResult.claims.admin !== true && user.uid === ADMIN_UID) {
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
                // Still allow the known admin UID even if token refresh fails
                if (user.uid === ADMIN_UID) {
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
        }
    }, [authenticated, loadPlatforms]);

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
                        <FiShield size={40} />
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
    const groupedByCategory = platforms.reduce<Record<string, Platform[]>>((acc, p) => {
        const cat = p.category || "Other";
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(p);
        return acc;
    }, {});

    return (
        <div className="admin-shell">
            <header className="admin-header">
                <button className="admin-back-btn" onClick={() => navigate("/")}>
                    <FiArrowLeft size={18} />
                    <span>Back</span>
                </button>
                <div className="admin-title-group">
                    <FiShield size={18} />
                    <h1>Admin Console</h1>
                </div>
                <button className="admin-add-btn" onClick={openAddForm}>
                    <FiPlus size={16} />
                    <span>Add Platform</span>
                </button>
            </header>

            <main className="admin-main">
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
                                    <input
                                        type="text"
                                        value={formCategory}
                                        onChange={(e) => setFormCategory(e.target.value)}
                                        placeholder="e.g. Social, Finance"
                                    />
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
                        <FiShield size={40} />
                        <h2>No platforms yet</h2>
                        <p>Add your first platform to get started</p>
                        <button className="admin-add-btn" onClick={openAddForm}>
                            <FiPlus size={16} />
                            <span>Add Platform</span>
                        </button>
                    </div>
                ) : (
                    <div className="admin-platform-list">
                        <div className="admin-stats-bar">
                            <span>{platforms.length} platform{platforms.length !== 1 ? "s" : ""}</span>
                            <span>{Object.keys(groupedByCategory).length} categor{Object.keys(groupedByCategory).length !== 1 ? "ies" : "y"}</span>
                        </div>
                        {Object.entries(groupedByCategory).map(([cat, items]) => (
                            <div key={cat} className="admin-category-group">
                                <h3 className="admin-category-label">{cat}</h3>
                                <div className="admin-platform-cards">
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
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}