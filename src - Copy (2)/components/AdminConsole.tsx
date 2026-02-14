import { useState, useEffect, useCallback } from "react";
import type { Platform, PlatformInput } from "../services/platformService";
import {
    getPlatforms,
    addPlatform,
    updatePlatform,
    deletePlatform,
} from "../services/platformService";
import {
    FiShield,
    FiLock,
    FiPlus,
    FiEdit2,
    FiTrash2,
    FiX,
    FiArrowLeft,
    FiSave,
    FiExternalLink,
    FiImage,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";

const ADMIN_KEY = "gisellekobe1!";

export default function AdminConsole() {
    const navigate = useNavigate();
    const [authenticated, setAuthenticated] = useState(false);
    const [keyInput, setKeyInput] = useState("");
    const [keyError, setKeyError] = useState(false);
    const [platforms, setPlatforms] = useState<Platform[]>([]);
    const [loading, setLoading] = useState(false);
    const [formOpen, setFormOpen] = useState(false);
    const [editingPlatform, setEditingPlatform] = useState<Platform | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Form fields
    const [formName, setFormName] = useState("");
    const [formDomain, setFormDomain] = useState("");
    const [formColor, setFormColor] = useState("#6366f1");
    const [formCategory, setFormCategory] = useState("");
    const [formLogoUrl, setFormLogoUrl] = useState("");
    const [formLink, setFormLink] = useState("");

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

    const handleKeySubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (keyInput === ADMIN_KEY) {
            setAuthenticated(true);
            setKeyError(false);
        } else {
            setKeyError(true);
        }
    };

    const resetForm = () => {
        setFormName("");
        setFormDomain("");
        setFormColor("#6366f1");
        setFormCategory("");
        setFormLogoUrl("");
        setFormLink("");
        setEditingPlatform(null);
        setFormOpen(false);
    };

    const openAddForm = () => {
        resetForm();
        setFormOpen(true);
    };

    const openEditForm = (p: Platform) => {
        setEditingPlatform(p);
        setFormName(p.name);
        setFormDomain(p.domain);
        setFormColor(p.color);
        setFormCategory(p.category);
        setFormLogoUrl(p.logoUrl);
        setFormLink(p.link);
        setFormOpen(true);
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formName.trim()) return;

        const input: PlatformInput = {
            name: formName.trim(),
            domain: formDomain.trim(),
            color: formColor,
            category: formCategory.trim() || "Other",
            logoUrl: formLogoUrl.trim(),
            link: formLink.trim(),
        };

        setSaving(true);
        try {
            if (editingPlatform) {
                await updatePlatform(editingPlatform.id, input);
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

    // --- Security key gate ---
    if (!authenticated) {
        return (
            <div className="admin-gate">
                <div className="admin-gate-card">
                    <div className="admin-gate-icon">
                        <FiShield size={40} />
                    </div>
                    <h1>Admin Console</h1>
                    <p className="admin-gate-sub">Enter security key to continue</p>
                    <form onSubmit={handleKeySubmit} className="admin-gate-form">
                        <div className="admin-gate-input-wrap">
                            <FiLock size={16} className="admin-gate-lock" />
                            <input
                                type="password"
                                placeholder="Security key"
                                value={keyInput}
                                onChange={(e) => {
                                    setKeyInput(e.target.value);
                                    setKeyError(false);
                                }}
                                autoFocus
                                className={keyError ? "error" : ""}
                            />
                        </div>
                        {keyError && <span className="admin-gate-error">Invalid security key</span>}
                        <button type="submit" className="admin-gate-btn">
                            Unlock
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // --- Admin panel ---
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
                                    <label>Domain</label>
                                    <input
                                        type="text"
                                        value={formDomain}
                                        onChange={(e) => setFormDomain(e.target.value)}
                                        placeholder="e.g. google.com"
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
                                <div className="admin-form-row">
                                    <label>
                                        <FiImage size={13} style={{ marginRight: 4 }} />
                                        Logo URL
                                    </label>
                                    <input
                                        type="url"
                                        value={formLogoUrl}
                                        onChange={(e) => setFormLogoUrl(e.target.value)}
                                        placeholder="https://example.com/logo.png"
                                    />
                                    {formLogoUrl && (
                                        <div className="admin-logo-preview">
                                            <img src={formLogoUrl} alt="Preview" onError={(e) => (e.currentTarget.style.display = 'none')} />
                                        </div>
                                    )}
                                </div>
                                <div className="admin-form-row">
                                    <label>
                                        <FiExternalLink size={13} style={{ marginRight: 4 }} />
                                        Link
                                    </label>
                                    <input
                                        type="url"
                                        value={formLink}
                                        onChange={(e) => setFormLink(e.target.value)}
                                        placeholder="https://google.com"
                                    />
                                </div>
                                <button type="submit" className="admin-form-submit" disabled={saving || !formName.trim()}>
                                    {saving ? (
                                        <span className="spinner" />
                                    ) : (
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
                                                    <span className="admin-platform-domain">{p.domain}</span>
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
                                                >
                                                    <FiEdit2 size={14} />
                                                </button>
                                                {deleteConfirm === p.id ? (
                                                    <div className="admin-delete-confirm">
                                                        <button
                                                            className="admin-icon-btn danger"
                                                            onClick={() => handleDelete(p.id)}
                                                            title="Confirm delete"
                                                        >
                                                            <FiTrash2 size={14} />
                                                        </button>
                                                        <button
                                                            className="admin-icon-btn"
                                                            onClick={() => setDeleteConfirm(null)}
                                                            title="Cancel"
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
