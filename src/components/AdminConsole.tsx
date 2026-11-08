import { useState, useEffect, useCallback, useMemo } from "react";
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
    FiChevronRight,
    FiChevronLeft,
    FiSearch,
    FiMenu,
    FiList,
    FiGrid,
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

    // Pending Logos state & pagination
    const [pendingPlatforms, setPendingPlatforms] = useState<{ name: string; count: number }[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);
    const [hasScannedPending, setHasScannedPending] = useState(false);
    const [pendingSearch, setPendingSearch] = useState("");
    const [pendingPage, setPendingPage] = useState(1);
    const [selectedPendingName, setSelectedPendingName] = useState<string | null>(null);
    const PENDING_PAGE_SIZE = 8;
    // Search, filter, sorting, pagination & view mode state for Platforms
    const [searchQuery, setSearchQuery] = useState("");
    const [filterCategory, setFilterCategory] = useState("All");
    const [platformLetterFilter, setPlatformLetterFilter] = useState("All");
    const [platformSortBy, setPlatformSortBy] = useState<"name-asc" | "name-desc" | "category" | "domain">("name-asc");
    const [platformViewMode, setPlatformViewMode] = useState<"table" | "grid">("table");
    const [platformPageSize, setPlatformPageSize] = useState<number>(50);
    const [currentPage, setCurrentPage] = useState(1);

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

                if (tokenResult.claims.admin === true) {
                    setAuthenticated(true);
                    setAccessDenied(false);
                } else {
                    setAccessDenied(true);
                }
            } catch (err) {
                console.error("Failed to check admin claims:", err);
                setAccessDenied(true);
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
                addedBy: auth.currentUser?.email || "admin",
                addedAt: new Date()
            });
            for (const userDoc of usersSnap.docs) {
                try {
                    await setDoc(doc(db, "users", userDoc.id), {
                        plan: "pro",
                        subscriptionStatus: "active",
                    }, { merge: true });
                } catch {
                    // SubscriptionContext also reads exemptions/{email} directly
                }
            }
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
            try {
                const usersQuery = query(collection(db, "users"), where("email", "==", email.trim().toLowerCase()));
                const usersSnap = await getDocs(usersQuery);
                for (const userDoc of usersSnap.docs) {
                    const uData = userDoc.data();
                    if (!uData.subscriptionId) {
                        await setDoc(doc(db, "users", userDoc.id), {
                            plan: "free",
                            subscriptionStatus: null,
                        }, { merge: true });
                    }
                }
            } catch {
                // Ignore if admin write to users/{uid} is restricted
            }
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
            setHasScannedPending(true);
        } catch (err) {
            console.error("Failed to scan pending platforms:", err);
            alert("Failed to scan for pending platforms. Check console for details.");
        } finally {
            setLoadingPending(false);
        }
    };

    // Auto-scan on opening Pending Logo tab if not scanned yet
    useEffect(() => {
        if (activeTab === "pending" && !hasScannedPending && pendingPlatforms.length === 0 && !loadingPending) {
            handleScanPendingLogos();
        }
    }, [activeTab, hasScannedPending, pendingPlatforms.length, loadingPending]);

    // Pending logos analytics calculations
    const sortedPending = useMemo(() => {
        return [...pendingPlatforms].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    }, [pendingPlatforms]);

    const filteredPending = useMemo(() => {
        if (!pendingSearch.trim()) return sortedPending;
        const q = pendingSearch.trim().toLowerCase();
        return sortedPending.filter(p => p.name.toLowerCase().includes(q));
    }, [sortedPending, pendingSearch]);

    const totalPendingPlatforms = pendingPlatforms.length;
    const totalPendingCredentials = useMemo(() => {
        return pendingPlatforms.reduce((sum, p) => sum + p.count, 0);
    }, [pendingPlatforms]);

    const multiUsePlatforms = useMemo(() => {
        return sortedPending.filter(p => p.count > 1);
    }, [sortedPending]);

    const singleUsePlatforms = useMemo(() => {
        return sortedPending.filter(p => p.count === 1);
    }, [sortedPending]);

    const multiUseCredentialsCount = useMemo(() => {
        return multiUsePlatforms.reduce((sum, p) => sum + p.count, 0);
    }, [multiUsePlatforms]);

    const activeSelectedPlatform = useMemo(() => {
        if (selectedPendingName) {
            const found = sortedPending.find(p => p.name.toLowerCase() === selectedPendingName.toLowerCase());
            if (found) return found;
        }
        return sortedPending[0] || null;
    }, [sortedPending, selectedPendingName]);

    const activeSelectedRank = useMemo(() => {
        if (!activeSelectedPlatform) return 0;
        return sortedPending.findIndex(p => p.name.toLowerCase() === activeSelectedPlatform.name.toLowerCase()) + 1;
    }, [sortedPending, activeSelectedPlatform]);

    const totalPendingPages = Math.ceil(filteredPending.length / PENDING_PAGE_SIZE) || 1;
    const paginatedPending = useMemo(() => {
        const start = (pendingPage - 1) * PENDING_PAGE_SIZE;
        return filteredPending.slice(start, start + PENDING_PAGE_SIZE);
    }, [filteredPending, pendingPage, PENDING_PAGE_SIZE]);

    useEffect(() => {
        setPendingPage(1);
    }, [pendingSearch]);

    useEffect(() => {
        if (pendingPage > totalPendingPages && totalPendingPages > 0) {
            setPendingPage(totalPendingPages);
        }
    }, [pendingPage, totalPendingPages]);

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
                setPendingPlatforms(prev => prev.filter(p => p.name.toLowerCase() !== input.name.toLowerCase()));
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

    // ─── Admin panel & Platforms directory state ─────────────────────────────
    const ALPHABET_LETTERS = useMemo(() => [
        "All", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#"
    ], []);

    const categoryCounts = useMemo(() => {
        const map: Record<string, number> = {};
        platforms.forEach(p => {
            const cat = p.category || "Other";
            map[cat] = (map[cat] || 0) + 1;
        });
        return map;
    }, [platforms]);

    const allCategories = useMemo(() => {
        return Object.keys(categoryCounts).sort((a, b) => a.localeCompare(b));
    }, [categoryCounts]);

    const activeFirstLetters = useMemo(() => {
        const set = new Set<string>();
        platforms.forEach(p => {
            const first = (p.name || "").trim().charAt(0).toUpperCase();
            if (/[A-Z]/.test(first)) {
                set.add(first);
            } else if (first) {
                set.add("#");
            }
        });
        return set;
    }, [platforms]);

    const filteredAndSortedPlatforms = useMemo(() => {
        let result = platforms.filter(p => {
            if (filterCategory !== "All" && (p.category || "Other") !== filterCategory) {
                return false;
            }
            if (platformLetterFilter !== "All") {
                const firstChar = (p.name || "").trim().charAt(0).toUpperCase();
                if (platformLetterFilter === "#") {
                    if (/[A-Z]/.test(firstChar)) return false;
                } else {
                    if (firstChar !== platformLetterFilter) return false;
                }
            }
            if (searchQuery.trim()) {
                const q = searchQuery.trim().toLowerCase();
                const matchesName = p.name.toLowerCase().includes(q);
                const matchesCategory = (p.category || "").toLowerCase().includes(q);
                const matchesDomain = (p.domain || "").toLowerCase().includes(q);
                const matchesLink = (p.link || "").toLowerCase().includes(q);
                if (!matchesName && !matchesCategory && !matchesDomain && !matchesLink) {
                    return false;
                }
            }
            return true;
        });

        result.sort((a, b) => {
            if (platformSortBy === "name-asc") {
                return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
            }
            if (platformSortBy === "name-desc") {
                return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
            }
            if (platformSortBy === "category") {
                const catComp = (a.category || "Other").localeCompare(b.category || "Other");
                if (catComp !== 0) return catComp;
                return a.name.localeCompare(b.name);
            }
            if (platformSortBy === "domain") {
                const domA = a.domain || a.link || "";
                const domB = b.domain || b.link || "";
                return domA.localeCompare(domB) || a.name.localeCompare(b.name);
            }
            return 0;
        });

        return result;
    }, [platforms, filterCategory, platformLetterFilter, searchQuery, platformSortBy]);

    const totalPlatformPages = Math.ceil(filteredAndSortedPlatforms.length / platformPageSize) || 1;

    useEffect(() => {
        if (currentPage > totalPlatformPages && totalPlatformPages > 0) {
            setCurrentPage(totalPlatformPages);
        }
    }, [currentPage, totalPlatformPages]);

    const paginatedPlatforms = useMemo(() => {
        if (platformPageSize >= 9000) return filteredAndSortedPlatforms;
        const start = (currentPage - 1) * platformPageSize;
        return filteredAndSortedPlatforms.slice(start, start + platformPageSize);
    }, [filteredAndSortedPlatforms, currentPage, platformPageSize]);

    const isPlatformFiltered = searchQuery.trim() !== "" || filterCategory !== "All" || platformLetterFilter !== "All";

    const resetPlatformFilters = () => {
        setSearchQuery("");
        setFilterCategory("All");
        setPlatformLetterFilter("All");
        setCurrentPage(1);
    };

    const formatDisplayDomain = (p: Platform) => {
        if (p.domain) return p.domain;
        if (p.link) {
            try {
                return new URL(p.link.startsWith("http") ? p.link : `https://${p.link}`).hostname.replace(/^www\./, "");
            } catch {
                return p.link;
            }
        }
        return "—";
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

                {activeTab === "platforms" && (
                    <>
                        <header className="admin-header">
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <button className="admin-menu-btn" onClick={() => setSidebarOpen(true)}>
                                    <FiMenu size={20} />
                                </button>
                                <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Platforms Directory</h2>
                            </div>
                            <button className="admin-add-btn" onClick={openAddForm}>
                                <FiPlus size={16} />
                                <span>Add Platform</span>
                            </button>
                        </header>
                        <main className="admin-content-main">
                            <div className="admin-platforms-container">
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
                                    <div className="admin-platforms-layout">
                                        {/* 1. Category Sidebar */}
                                        <aside className="admin-cat-sidebar">
                                            <div className="admin-cat-sidebar-header">
                                                <span className="admin-cat-title">Categories</span>
                                                <span className="admin-cat-total">{allCategories.length}</span>
                                            </div>
                                            <div className="admin-cat-list">
                                                <button
                                                    type="button"
                                                    className={`admin-cat-item ${filterCategory === "All" ? "active" : ""}`}
                                                    onClick={() => { setFilterCategory("All"); setCurrentPage(1); }}
                                                >
                                                    <span>All Platforms</span>
                                                    <span className="admin-cat-count">{platforms.length}</span>
                                                </button>
                                                {allCategories.map(cat => (
                                                    <button
                                                        key={cat}
                                                        type="button"
                                                        className={`admin-cat-item ${filterCategory === cat ? "active" : ""}`}
                                                        onClick={() => { setFilterCategory(cat); setCurrentPage(1); }}
                                                    >
                                                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</span>
                                                        <span className="admin-cat-count">{categoryCounts[cat] || 0}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </aside>

                                        {/* 2. Main Platform Panel */}
                                        <div className="admin-platforms-main">
                                            {/* Toolbar: Search, Sort, Page Size, View Mode Toggle */}
                                            <div className="admin-platforms-toolbar">
                                                <div className="admin-platforms-search">
                                                    <FiSearch size={14} className="admin-search-icon" />
                                                    <input
                                                        type="text"
                                                        placeholder="Search platforms by name, category, domain..."
                                                        value={searchQuery}
                                                        onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                                    />
                                                    {searchQuery && (
                                                        <button
                                                            type="button"
                                                            className="admin-search-clear"
                                                            onClick={() => { setSearchQuery(""); setCurrentPage(1); }}
                                                            title="Clear search"
                                                        >
                                                            <FiX size={14} />
                                                        </button>
                                                    )}
                                                </div>

                                                <div className="admin-platforms-toolbar-actions">
                                                    <select
                                                        className="admin-compact-select"
                                                        value={platformSortBy}
                                                        onChange={e => setPlatformSortBy(e.target.value as any)}
                                                        title="Sort order"
                                                    >
                                                        <option value="name-asc">Sort: Name (A → Z)</option>
                                                        <option value="name-desc">Sort: Name (Z → A)</option>
                                                        <option value="category">Sort: Category</option>
                                                        <option value="domain">Sort: Domain</option>
                                                    </select>

                                                    <select
                                                        className="admin-compact-select"
                                                        value={platformPageSize}
                                                        onChange={e => { setPlatformPageSize(Number(e.target.value)); setCurrentPage(1); }}
                                                        title="Items per page"
                                                    >
                                                        <option value={25}>25 / page</option>
                                                        <option value={50}>50 / page</option>
                                                        <option value={100}>100 / page</option>
                                                        <option value={9999}>Show All</option>
                                                    </select>

                                                    <div className="admin-view-toggle">
                                                        <button
                                                            type="button"
                                                            className={`admin-view-btn ${platformViewMode === "table" ? "active" : ""}`}
                                                            onClick={() => setPlatformViewMode("table")}
                                                            title="Compact Table View"
                                                        >
                                                            <FiList size={15} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`admin-view-btn ${platformViewMode === "grid" ? "active" : ""}`}
                                                            onClick={() => setPlatformViewMode("grid")}
                                                            title="Compact Grid View"
                                                        >
                                                            <FiGrid size={15} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Alphabetical A-Z Jump Bar */}
                                            <div className="admin-alphabet-bar">
                                                {ALPHABET_LETTERS.map(letter => {
                                                    const isActive = platformLetterFilter === letter;
                                                    const hasItems = letter === "All" || activeFirstLetters.has(letter);
                                                    return (
                                                        <button
                                                            key={letter}
                                                            type="button"
                                                            className={`admin-alphabet-btn ${isActive ? "active" : ""}`}
                                                            style={{
                                                                opacity: hasItems ? 1 : 0.35,
                                                                cursor: hasItems ? "pointer" : "default"
                                                            }}
                                                            onClick={() => {
                                                                setPlatformLetterFilter(letter);
                                                                setCurrentPage(1);
                                                            }}
                                                            title={letter === "All" ? "All letters" : `Filter starting with ${letter}`}
                                                        >
                                                            {letter}
                                                        </button>
                                                    );
                                                })}
                                            </div>

                                            {/* Subbar: Count, filter tags, reset button */}
                                            <div className="admin-platforms-subbar">
                                                <div className="admin-platforms-counter">
                                                    Showing <strong>{filteredAndSortedPlatforms.length === 0 ? 0 : (currentPage - 1) * platformPageSize + 1}</strong>
                                                    {" – "}
                                                    <strong>{Math.min(currentPage * platformPageSize, filteredAndSortedPlatforms.length)}</strong>
                                                    {" of "}
                                                    <strong>{filteredAndSortedPlatforms.length}</strong> platforms
                                                    {isPlatformFiltered && (
                                                        <span className="admin-filtered-tag">
                                                            {" "}(filtered from {platforms.length} total)
                                                        </span>
                                                    )}
                                                </div>
                                                {isPlatformFiltered && (
                                                    <button
                                                        type="button"
                                                        className="admin-reset-filters-btn"
                                                        onClick={resetPlatformFilters}
                                                    >
                                                        Reset filters
                                                    </button>
                                                )}
                                            </div>

                                            {/* Platforms Display */}
                                            {filteredAndSortedPlatforms.length === 0 ? (
                                                <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)" }}>
                                                    <p style={{ margin: "0 0 12px 0", fontSize: "0.9rem" }}>No platforms found matching your filters.</p>
                                                    <button
                                                        type="button"
                                                        onClick={resetPlatformFilters}
                                                        style={{
                                                            padding: "6px 14px",
                                                            borderRadius: "var(--radius-sm)",
                                                            border: "1px solid var(--border-color)",
                                                            background: "var(--bg-primary)",
                                                            color: "var(--text-primary)",
                                                            fontSize: "0.8rem",
                                                            cursor: "pointer"
                                                        }}
                                                    >
                                                        Clear Filters
                                                    </button>
                                                </div>
                                            ) : platformViewMode === "table" ? (
                                                <div className="admin-table-wrap">
                                                    <table className="admin-compact-table">
                                                        <thead>
                                                            <tr>
                                                                <th style={{ width: "38%" }}>Platform</th>
                                                                <th style={{ width: "20%" }}>Category</th>
                                                                <th style={{ width: "27%" }}>Domain / Website</th>
                                                                <th style={{ width: "15%", textAlign: "right" }}>Actions</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {paginatedPlatforms.map(p => {
                                                                const displayDomain = formatDisplayDomain(p);
                                                                return (
                                                                    <tr key={p.id}>
                                                                        <td>
                                                                            <div className="admin-table-platform-cell">
                                                                                {p.logoUrl ? (
                                                                                    <img
                                                                                        src={p.logoUrl}
                                                                                        alt={p.name}
                                                                                        className="admin-table-logo"
                                                                                        onError={(e) => (e.currentTarget.style.display = "none")}
                                                                                    />
                                                                                ) : (
                                                                                    <div
                                                                                        className="admin-table-initial"
                                                                                        style={{ backgroundColor: p.color || "#6366f1" }}
                                                                                    >
                                                                                        {p.name.charAt(0).toUpperCase()}
                                                                                    </div>
                                                                                )}
                                                                                <span className="admin-table-name" title={p.name}>{p.name}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td>
                                                                            <span className="admin-table-category-badge">{p.category || "Other"}</span>
                                                                        </td>
                                                                        <td>
                                                                            {p.link ? (
                                                                                <a
                                                                                    href={p.link}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="admin-table-domain-link"
                                                                                    title={p.link}
                                                                                >
                                                                                    {displayDomain}
                                                                                </a>
                                                                            ) : (
                                                                                <span className="admin-table-domain-text">{displayDomain}</span>
                                                                            )}
                                                                        </td>
                                                                        <td>
                                                                            <div className="admin-table-actions">
                                                                                {p.link && (
                                                                                    <a
                                                                                        href={p.link}
                                                                                        target="_blank"
                                                                                        rel="noopener noreferrer"
                                                                                        className="admin-icon-btn small"
                                                                                        title="Visit website"
                                                                                    >
                                                                                        <FiExternalLink size={13} />
                                                                                    </a>
                                                                                )}
                                                                                <button
                                                                                    type="button"
                                                                                    className="admin-icon-btn small"
                                                                                    onClick={() => openEditForm(p)}
                                                                                    title="Edit platform"
                                                                                    disabled={saving}
                                                                                >
                                                                                    <FiEdit2 size={13} />
                                                                                </button>
                                                                                {deleteConfirm === p.id ? (
                                                                                    <div className="admin-delete-confirm small">
                                                                                        <button
                                                                                            type="button"
                                                                                            className="admin-icon-btn small danger"
                                                                                            onClick={() => handleDelete(p.id)}
                                                                                            title="Confirm delete"
                                                                                            disabled={saving}
                                                                                        >
                                                                                            {saving ? <span className="spinner" style={{ width: 10, height: 10 }} /> : <FiTrash2 size={13} />}
                                                                                        </button>
                                                                                        <button
                                                                                            type="button"
                                                                                            className="admin-icon-btn small"
                                                                                            onClick={() => setDeleteConfirm(null)}
                                                                                            title="Cancel"
                                                                                            disabled={saving}
                                                                                        >
                                                                                            <FiX size={13} />
                                                                                        </button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <button
                                                                                        type="button"
                                                                                        className="admin-icon-btn small danger"
                                                                                        onClick={() => setDeleteConfirm(p.id)}
                                                                                        title="Delete platform"
                                                                                    >
                                                                                        <FiTrash2 size={13} />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                /* Grid View */
                                                <div className="admin-compact-grid">
                                                    {paginatedPlatforms.map(p => {
                                                        const displayDomain = formatDisplayDomain(p);
                                                        return (
                                                            <div key={p.id} className="admin-compact-grid-card">
                                                                <div className="admin-grid-card-top">
                                                                    {p.logoUrl ? (
                                                                        <img
                                                                            src={p.logoUrl}
                                                                            alt={p.name}
                                                                            className="admin-table-logo"
                                                                            onError={(e) => (e.currentTarget.style.display = "none")}
                                                                        />
                                                                    ) : (
                                                                        <div
                                                                            className="admin-table-initial"
                                                                            style={{ backgroundColor: p.color || "#6366f1" }}
                                                                        >
                                                                            {p.name.charAt(0).toUpperCase()}
                                                                        </div>
                                                                    )}
                                                                    <div className="admin-grid-card-info">
                                                                        <span className="admin-table-name" title={p.name}>{p.name}</span>
                                                                        <span className="admin-table-category-badge" style={{ alignSelf: "flex-start" }}>
                                                                            {p.category || "Other"}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <div className="admin-grid-card-bottom">
                                                                    <span className="admin-grid-domain" title={displayDomain}>
                                                                        {displayDomain}
                                                                    </span>
                                                                    <div className="admin-table-actions">
                                                                        {p.link && (
                                                                            <a
                                                                                href={p.link}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="admin-icon-btn small"
                                                                                title="Visit website"
                                                                            >
                                                                                <FiExternalLink size={13} />
                                                                            </a>
                                                                        )}
                                                                        <button
                                                                            type="button"
                                                                            className="admin-icon-btn small"
                                                                            onClick={() => openEditForm(p)}
                                                                            title="Edit platform"
                                                                            disabled={saving}
                                                                        >
                                                                            <FiEdit2 size={13} />
                                                                        </button>
                                                                        {deleteConfirm === p.id ? (
                                                                            <div className="admin-delete-confirm small">
                                                                                <button
                                                                                    type="button"
                                                                                    className="admin-icon-btn small danger"
                                                                                    onClick={() => handleDelete(p.id)}
                                                                                    title="Confirm delete"
                                                                                    disabled={saving}
                                                                                >
                                                                                    {saving ? <span className="spinner" style={{ width: 10, height: 10 }} /> : <FiTrash2 size={13} />}
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    className="admin-icon-btn small"
                                                                                    onClick={() => setDeleteConfirm(null)}
                                                                                    title="Cancel"
                                                                                    disabled={saving}
                                                                                >
                                                                                    <FiX size={13} />
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                className="admin-icon-btn small danger"
                                                                                onClick={() => setDeleteConfirm(p.id)}
                                                                                title="Delete platform"
                                                                            >
                                                                                <FiTrash2 size={13} />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}

                                            {/* Pagination Controls */}
                                            {totalPlatformPages > 1 && (
                                                <div className="admin-pagination-bar" style={{ marginTop: "16px" }}>
                                                    <div className="admin-pagination-info">
                                                        Showing <strong>{filteredAndSortedPlatforms.length === 0 ? 0 : (currentPage - 1) * platformPageSize + 1}–{Math.min(currentPage * platformPageSize, filteredAndSortedPlatforms.length)}</strong> of <strong>{filteredAndSortedPlatforms.length}</strong> platforms
                                                    </div>
                                                    <div className="admin-pagination-controls">
                                                        <button
                                                            type="button"
                                                            className="admin-page-nav-btn"
                                                            disabled={currentPage <= 1}
                                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                        >
                                                            <FiChevronLeft size={13} />
                                                            <span>Prev</span>
                                                        </button>
                                                        {Array.from({ length: totalPlatformPages }, (_, i) => i + 1)
                                                            .filter(page => page === 1 || page === totalPlatformPages || Math.abs(page - currentPage) <= 2)
                                                            .map((page, idx, arr) => {
                                                                const prevPage = arr[idx - 1];
                                                                const showEllipsis = prevPage && page - prevPage > 1;
                                                                return (
                                                                    <span key={page} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                                                                        {showEllipsis && <span style={{ padding: "0 2px", color: "var(--text-muted)", fontSize: "0.74rem" }}>…</span>}
                                                                        <button
                                                                            type="button"
                                                                            className={`admin-page-num-btn ${currentPage === page ? "active" : ""}`}
                                                                            onClick={() => setCurrentPage(page)}
                                                                        >
                                                                            {page}
                                                                        </button>
                                                                    </span>
                                                                );
                                                            })}
                                                        <button
                                                            type="button"
                                                            className="admin-page-nav-btn"
                                                            disabled={currentPage >= totalPlatformPages}
                                                            onClick={() => setCurrentPage(p => Math.min(totalPlatformPages, p + 1))}
                                                        >
                                                            <span>Next</span>
                                                            <FiChevronRight size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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
                                                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text-primary)", fontSize: "0.82rem" }}>
                                                    <span>{ex.email}</span>
                                                    <span style={{ fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: "rgba(99, 102, 241, 0.15)", color: "var(--accent-primary, #6366f1)", border: "1px solid rgba(99, 102, 241, 0.35)" }}>PRO TIER</span>
                                                </div>
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
                                <h2 style={{ fontSize: "1.1rem", margin: 0 }}>Pending Logos Analytics</h2>
                            </div>
                            <button
                                className="admin-add-btn"
                                onClick={handleScanPendingLogos}
                                disabled={loadingPending}
                                title="Scan credentials to find unbranded platforms"
                            >
                                {loadingPending ? <span className="spinner small" /> : <FiSearch size={16} />}
                                <span>{loadingPending ? "Scanning…" : "Scan for Pending Logos"}</span>
                            </button>
                        </header>
                        <main className="admin-content-main">
                            <div className="admin-pending-container">
                                {loadingPending ? (
                                    <div className="admin-loading">
                                        <span className="spinner large" />
                                        <p>Scanning all credentials across users to analyze unbranded platforms…</p>
                                    </div>
                                ) : pendingPlatforms.length === 0 ? (
                                    <div className="admin-empty">
                                        <FiImage size={40} style={{ color: "var(--text-secondary)", marginBottom: 10 }} />
                                        <h2>No Pending Logos</h2>
                                        <p>All platforms in user credentials match global platforms, or you haven't scanned yet.</p>
                                        <button className="admin-add-btn" onClick={handleScanPendingLogos} style={{ marginTop: 12 }}>
                                            <FiSearch size={16} />
                                            <span>Scan for Pending Logos</span>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="admin-pending-grid">
                                        {/* LEFT HALF: Clean Analytical View (No Icons, No Emojis, No AI Squares) */}
                                        <div className="admin-analytics-left">
                                            {/* Unified Summary Stats Bar (No Square Icon Containers) */}
                                            <div className="admin-stats-summary-bar">
                                                <div className="admin-stat-summary-col">
                                                    <span className="admin-stat-summary-label">Missing Logos</span>
                                                    <span className="admin-stat-summary-num">{totalPendingPlatforms}</span>
                                                </div>
                                                <div className="admin-stat-summary-col">
                                                    <span className="admin-stat-summary-label">Total Credentials</span>
                                                    <span className="admin-stat-summary-num">{totalPendingCredentials}</span>
                                                </div>
                                                <div className="admin-stat-summary-col">
                                                    <span className="admin-stat-summary-label">Multi-User Need</span>
                                                    <span className="admin-stat-summary-num">{multiUsePlatforms.length}</span>
                                                </div>
                                                <div className="admin-stat-summary-col">
                                                    <span className="admin-stat-summary-label">Top Requested</span>
                                                    <span className="admin-stat-summary-num" title={sortedPending[0]?.name}>
                                                        {sortedPending[0]?.name || "None"}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Spotlight Decision Card for Selected/Top Platform (No Top Rainbow Line, No Emojis) */}
                                            {activeSelectedPlatform && (
                                                <div className="admin-spotlight-card">
                                                    <div className="admin-spotlight-header">
                                                        <div>
                                                            <div className="admin-spotlight-tag">Platform Spotlight</div>
                                                            <h3 className="admin-spotlight-title">{activeSelectedPlatform.name}</h3>
                                                        </div>
                                                        <span className="admin-spotlight-rank">
                                                            Rank {activeSelectedRank} of {totalPendingPlatforms}
                                                        </span>
                                                    </div>

                                                    {/* Key Metrics */}
                                                    <div className="admin-spotlight-metrics">
                                                        <div className="admin-metric-item">
                                                            <span className="admin-metric-num">{activeSelectedPlatform.count}</span>
                                                            <span className="admin-metric-desc">Credential{activeSelectedPlatform.count !== 1 ? 's' : ''} using this</span>
                                                        </div>
                                                        <div className="admin-metric-item">
                                                            <span className="admin-metric-num">
                                                                {((activeSelectedPlatform.count / (totalPendingCredentials || 1)) * 100).toFixed(1)}%
                                                            </span>
                                                            <span className="admin-metric-desc">Share of unbranded demand</span>
                                                        </div>
                                                    </div>

                                                    {/* Demand Share Meter Bar */}
                                                    <div className="admin-demand-bar-wrap">
                                                        <div className="admin-demand-bar-header">
                                                            <span>Demand Concentration</span>
                                                            <span>
                                                                {((activeSelectedPlatform.count / (totalPendingCredentials || 1)) * 100).toFixed(1)}% of total
                                                            </span>
                                                        </div>
                                                        <div className="admin-demand-track">
                                                            <div 
                                                                className="admin-demand-fill" 
                                                                style={{ 
                                                                    width: `${Math.min(100, Math.max(6, (activeSelectedPlatform.count / (totalPendingCredentials || 1)) * 100))}%` 
                                                                }} 
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Logo Decision Recommendation (No Emojis) */}
                                                    <div className={`admin-recommendation-box ${activeSelectedPlatform.count >= 3 ? 'urgent' : activeSelectedPlatform.count === 2 ? 'moderate' : 'low'}`}>
                                                        <div className="admin-recommendation-title">
                                                            {activeSelectedPlatform.count >= 3 ? (
                                                                <>High Priority: Official Logo Recommended</>
                                                            ) : activeSelectedPlatform.count === 2 ? (
                                                                <>Moderate Need: Emerging Adoption Trend</>
                                                            ) : (
                                                                <>Low Urgency: Single User Entry</>
                                                            )}
                                                        </div>
                                                        <div className="admin-recommendation-desc">
                                                            {activeSelectedPlatform.count >= 3 ? (
                                                                `High credential density (${activeSelectedPlatform.count} credentials). Adding an official platform entry and logo will standardize branding for multiple users.`
                                                            ) : activeSelectedPlatform.count === 2 ? (
                                                                `Used across ${activeSelectedPlatform.count} credentials. Adding an official platform now will standardize formatting and prevent future duplicate variants.`
                                                            ) : (
                                                                `Currently only used by 1 credential. You can safely wait to see if more users add credentials for this platform before uploading an official logo.`
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Action Button */}
                                                    <button
                                                        type="button"
                                                        className="admin-spotlight-cta"
                                                        onClick={() => {
                                                            setFormName(activeSelectedPlatform.name);
                                                            setFormCategory("Other");
                                                            setFormColor("#6366f1");
                                                            setFormLogoUrl("");
                                                            setFormLink("");
                                                            setEditingPlatform(null);
                                                            setFormOpen(true);
                                                        }}
                                                    >
                                                        <FiPlus size={15} />
                                                        <span>Add Official Logo for "{activeSelectedPlatform.name}"</span>
                                                    </button>
                                                </div>
                                            )}

                                            {/* Adoption Tier Breakdown (No Icons, No Emojis, No Dots) */}
                                            <div className="admin-breakdown-card">
                                                <div className="admin-breakdown-title">
                                                    <span>Demand Distribution Breakdown</span>
                                                </div>
                                                <div className="admin-tier-list">
                                                    <div className="admin-tier-row">
                                                        <div className="admin-tier-name">
                                                            <span>Multi-Credential Platforms (2+)</span>
                                                        </div>
                                                        <div className="admin-tier-stats">
                                                            <strong>{multiUsePlatforms.length}</strong> platforms ({multiUseCredentialsCount} creds)
                                                        </div>
                                                    </div>
                                                    <div className="admin-tier-row">
                                                        <div className="admin-tier-name">
                                                            <span>Single-Credential Platforms (1)</span>
                                                        </div>
                                                        <div className="admin-tier-stats">
                                                            <strong>{singleUsePlatforms.length}</strong> platforms ({singleUsePlatforms.length} creds)
                                                        </div>
                                                    </div>
                                                </div>
                                                <p style={{ fontSize: "0.72rem", color: "var(--text-secondary)", margin: 0, lineHeight: 1.45 }}>
                                                    <em>Adding official logos for just the <strong>{multiUsePlatforms.length}</strong> multi-credential platform{multiUsePlatforms.length !== 1 ? 's' : ''} will resolve <strong>{Math.round((multiUseCredentialsCount / (totalPendingCredentials || 1)) * 100)}%</strong> of unbranded credentials in the entire vault.</em>
                                                </p>
                                            </div>
                                        </div>

                                        {/* RIGHT HALF: Highest Used Platforms List (No Icons in Header, Clean Numerals) */}
                                        <div className="admin-pending-right">
                                            <div className="admin-pending-list-header">
                                                <div className="admin-pending-list-title">
                                                    <span>Highest Used Platforms</span>
                                                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 500, marginLeft: 6 }}>
                                                        ({sortedPending.length} pending)
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Search filter input */}
                                            {sortedPending.length > 3 && (
                                                <div className="admin-pending-search-wrap">
                                                    <FiSearch size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                                                    <input
                                                        type="text"
                                                        className="admin-pending-search-input"
                                                        placeholder="Search pending platforms..."
                                                        value={pendingSearch}
                                                        onChange={(e) => setPendingSearch(e.target.value)}
                                                    />
                                                    {pendingSearch && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setPendingSearch("")}
                                                            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                                                        >
                                                            <FiX size={13} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* Items List */}
                                            <div className="admin-pending-items">
                                                {paginatedPending.length === 0 ? (
                                                    <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-secondary)", fontSize: "0.82rem" }}>
                                                        No platforms match "{pendingSearch}"
                                                    </div>
                                                ) : (
                                                    paginatedPending.map((p, idx) => {
                                                        const globalRank = (pendingPage - 1) * PENDING_PAGE_SIZE + idx + 1;
                                                        const isSelected = activeSelectedPlatform?.name.toLowerCase() === p.name.toLowerCase();
                                                        const sharePercent = ((p.count / (totalPendingCredentials || 1)) * 100).toFixed(0);

                                                        return (
                                                            <div
                                                                key={p.name}
                                                                className={`admin-pending-row ${isSelected ? 'selected' : ''}`}
                                                                onClick={() => setSelectedPendingName(p.name)}
                                                                title={`Click to view analysis for ${p.name}`}
                                                            >
                                                                <div className="admin-row-left">
                                                                    {/* Clean Rank Number: NO hash, NO circle border, NO bg color */}
                                                                    <span className="admin-rank-num">
                                                                        {globalRank}
                                                                    </span>
                                                                    <div className="admin-row-info">
                                                                        <div className="admin-row-name">{p.name}</div>
                                                                        <div className="admin-row-sub">
                                                                            <span>Used by <strong>{p.count}</strong> credential{p.count !== 1 ? 's' : ''}</span>
                                                                            <span className="admin-share-pill">{sharePercent}% demand</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="admin-row-actions">
                                                                    <button
                                                                        type="button"
                                                                        className="admin-icon-btn"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setFormName(p.name);
                                                                            setFormCategory("Other");
                                                                            setFormColor("#6366f1");
                                                                            setFormLogoUrl("");
                                                                            setFormLink("");
                                                                            setEditingPlatform(null);
                                                                            setFormOpen(true);
                                                                        }}
                                                                        title={`Add official platform for "${p.name}"`}
                                                                    >
                                                                        <FiPlus size={14} />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })
                                                )}
                                            </div>

                                            {/* Pagination Bar */}
                                            {totalPendingPages > 1 && (
                                                <div className="admin-pagination-bar">
                                                    <div className="admin-pagination-info">
                                                        Showing <strong>{(pendingPage - 1) * PENDING_PAGE_SIZE + 1}–{Math.min(pendingPage * PENDING_PAGE_SIZE, filteredPending.length)}</strong> of <strong>{filteredPending.length}</strong>
                                                    </div>
                                                    <div className="admin-pagination-controls">
                                                        <button
                                                            type="button"
                                                            className="admin-page-nav-btn"
                                                            disabled={pendingPage <= 1}
                                                            onClick={() => setPendingPage(p => Math.max(1, p - 1))}
                                                        >
                                                            <FiChevronLeft size={13} />
                                                            <span>Prev</span>
                                                        </button>

                                                        {Array.from({ length: totalPendingPages }, (_, i) => i + 1).map(num => (
                                                            <button
                                                                key={num}
                                                                type="button"
                                                                className={`admin-page-num-btn ${pendingPage === num ? 'active' : ''}`}
                                                                onClick={() => setPendingPage(num)}
                                                            >
                                                                {num}
                                                            </button>
                                                        ))}

                                                        <button
                                                            type="button"
                                                            className="admin-page-nav-btn"
                                                            disabled={pendingPage >= totalPendingPages}
                                                            onClick={() => setPendingPage(p => Math.min(totalPendingPages, p + 1))}
                                                        >
                                                            <span>Next</span>
                                                            <FiChevronRight size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
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