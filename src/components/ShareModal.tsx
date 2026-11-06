import { useEffect, useMemo, useState } from "react";
import {
    FiSearch, FiStar, FiX, FiUsers, FiUserPlus, FiLoader, FiLock, FiShare2, FiTrash2, FiCheck, FiClock,
} from "react-icons/fi";
import { useSubscription } from "../context/SubscriptionContext";
import { useTaskToast } from "../context/TaskToastContext";
import {
    lookupRecipient,
    getShareContacts,
    setFavoriteRecipient,
    saveShareGroup,
    deleteShareGroup,
    shareItems,
    shareErrorMessage,
} from "../services/shareService";
import type { ShareableItem, ShareRecipient, ShareContact, ShareGroup } from "../services/shareService";

interface ShareModalProps {
    isOpen: boolean;
    items: ShareableItem[];
    onClose: () => void;
    onShared?: () => void;
}

type Tab = "frequent" | "favorites" | "groups";

const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--border-color)",
    background: "var(--bg-input)",
};

const iconBtn: React.CSSProperties = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    color: "var(--text-secondary)",
    display: "flex",
    alignItems: "center",
    padding: 4,
};

function Avatar({ label }: { label: string }) {
    return (
        <div style={{
            width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
            background: "var(--accent)", color: "#000", fontWeight: 700, fontSize: "0.75rem",
            display: "flex", alignItems: "center", justifyContent: "center", textTransform: "uppercase",
        }}>
            {(label || "?").charAt(0)}
        </div>
    );
}

export default function ShareModal({ isOpen, items, onClose, onShared }: ShareModalProps) {
    const { isPro } = useSubscription();
    const { startTask, updateTask, finishTask } = useTaskToast();

    const [email, setEmail] = useState("");
    const [searching, setSearching] = useState(false);
    const [searchResult, setSearchResult] = useState<ShareRecipient | null>(null);
    const [searchMessage, setSearchMessage] = useState("");

    const [contacts, setContacts] = useState<ShareContact[]>([]);
    const [groups, setGroups] = useState<ShareGroup[]>([]);
    const [loadingContacts, setLoadingContacts] = useState(false);
    const [tab, setTab] = useState<Tab>("frequent");

    const [selected, setSelected] = useState<ShareRecipient[]>([]);
    const [groupName, setGroupName] = useState("");
    const [savingGroup, setSavingGroup] = useState(false);
    const [busyFavorite, setBusyFavorite] = useState<string | null>(null);

    const [sharing, setSharing] = useState(false);
    const [progress, setProgress] = useState<{ percent: number; label: string } | null>(null);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    const title = items.length === 1
        ? `Share "${items[0].kind === "file" ? items[0].file.name : items[0].folder.name}"`
        : `Share ${items.length} items`;

    const refreshContacts = async () => {
        setLoadingContacts(true);
        try {
            const res = await getShareContacts();
            setContacts(res.contacts);
            setGroups(res.groups);
        } catch (err) {
            console.warn("Failed to load share contacts:", err);
        } finally {
            setLoadingContacts(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        setEmail("");
        setSearchResult(null);
        setSearchMessage("");
        setSelected([]);
        setGroupName("");
        setError("");
        setDone(false);
        setProgress(null);
        if (isPro) void refreshContacts();
    }, [isOpen, isPro]);

    const frequent = useMemo(
        () => contacts
            .filter((c) => c.shareCount > 0)
            .sort((a, b) => b.shareCount - a.shareCount || (b.lastSharedAt ?? 0) - (a.lastSharedAt ?? 0))
            .slice(0, 8),
        [contacts]
    );
    const favorites = useMemo(
        () => contacts.filter((c) => c.favorite).sort((a, b) => a.email.localeCompare(b.email)),
        [contacts]
    );
    const contactByUid = useMemo(() => new Map(contacts.map((c) => [c.uid, c])), [contacts]);

    if (!isOpen) return null;

    const isSelected = (uid: string) => selected.some((s) => s.uid === uid);
    const isFavorite = (uid: string) =>
        contactByUid.get(uid)?.favorite ?? (searchResult?.uid === uid ? !!searchResult.favorite : false);

    const addRecipient = (r: ShareRecipient) => {
        setError("");
        if (!r.publicKeyJwk) {
            setError(`${r.email} hasn't enabled file sharing yet. Ask them to sign in to Fort Sterling once.`);
            return;
        }
        setSelected((prev) => (prev.some((p) => p.uid === r.uid) ? prev : [...prev, r]));
    };

    const removeRecipient = (uid: string) => setSelected((prev) => prev.filter((p) => p.uid !== uid));

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setSearching(true);
        setSearchResult(null);
        setSearchMessage("");
        setError("");
        try {
            const result = await lookupRecipient(email);
            if (result) {
                setSearchResult(result);
            } else {
                setSearchMessage(`No Fort Sterling account found for "${email.trim()}".`);
            }
        } catch (err) {
            setSearchMessage(shareErrorMessage(err));
        } finally {
            setSearching(false);
        }
    };

    const toggleFavorite = async (r: ShareRecipient) => {
        const next = !isFavorite(r.uid);
        setBusyFavorite(r.uid);
        try {
            await setFavoriteRecipient(r.uid, next);
            if (searchResult?.uid === r.uid) setSearchResult({ ...searchResult, favorite: next });
            await refreshContacts();
        } catch (err) {
            setError(shareErrorMessage(err));
        } finally {
            setBusyFavorite(null);
        }
    };

    const addGroup = (g: ShareGroup) => {
        const members = g.memberUids.map((uid) => contactByUid.get(uid)).filter((c): c is ShareContact => !!c);
        const noKey = members.filter((m) => !m.publicKeyJwk);
        setSelected((prev) => {
            const next = [...prev];
            members.filter((m) => m.publicKeyJwk).forEach((m) => {
                if (!next.some((n) => n.uid === m.uid)) next.push(m);
            });
            return next;
        });
        setError(noKey.length > 0
            ? `Skipped ${noKey.map((m) => m.email).join(", ")} — they haven't enabled file sharing yet.`
            : "");
    };

    const handleSaveGroup = async () => {
        if (!groupName.trim() || selected.length === 0) return;
        setSavingGroup(true);
        setError("");
        try {
            await saveShareGroup(groupName.trim(), selected.map((s) => s.uid));
            setGroupName("");
            await refreshContacts();
            setTab("groups");
        } catch (err) {
            setError(shareErrorMessage(err));
        } finally {
            setSavingGroup(false);
        }
    };

    const handleDeleteGroup = async (g: ShareGroup) => {
        if (!window.confirm(`Delete the group "${g.name}"?`)) return;
        try {
            await deleteShareGroup(g.id);
            await refreshContacts();
        } catch (err) {
            setError(shareErrorMessage(err));
        }
    };

    const handleShare = async () => {
        if (selected.length === 0) return;
        setSharing(true);
        setError("");
        const itemLabel = items.length === 1
            ? `"${items[0].kind === "file" ? items[0].file.name : items[0].folder.name}"`
            : `${items.length} items`;
        const recipientLabel = selected.length === 1 ? selected[0].email : `${selected.length} people`;
        const taskId = startTask({
            title: `Sharing ${itemLabel}`,
            detail: `With ${recipientLabel}`,
            progress: 0,
        });
        try {
            await shareItems(items, selected, (percent, label) => {
                setProgress({ percent, label });
                updateTask(taskId, { progress: percent, detail: label });
            });
            setDone(true);
            onShared?.();
            void refreshContacts();
            finishTask(taskId, { status: "success", title: `Shared ${itemLabel}`, detail: `With ${selected.map((s) => s.email).join(", ")}` });
        } catch (err) {
            const message = shareErrorMessage(err);
            setError(message);
            finishTask(taskId, { status: "error", title: `Couldn't share ${itemLabel}`, detail: message });
        } finally {
            setSharing(false);
        }
    };

    const close = () => {
        if (sharing) return;
        onClose();
    };

    const renderContactRow = (c: ShareRecipient, extra?: React.ReactNode) => (
        <div key={c.uid} style={rowStyle}>
            <Avatar label={c.displayName || c.email} />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.82rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.displayName || c.email}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.email}{extra}
                </div>
            </div>
            <button
                type="button"
                style={{ ...iconBtn, color: isFavorite(c.uid) ? "#facc15" : "var(--text-secondary)" }}
                onClick={() => toggleFavorite(c)}
                disabled={busyFavorite === c.uid}
                title={isFavorite(c.uid) ? "Remove from favorites" : "Add to favorites"}
            >
                {busyFavorite === c.uid
                    ? <FiLoader size={15} className="spin" />
                    : <FiStar size={15} fill={isFavorite(c.uid) ? "#facc15" : "none"} />}
            </button>
            {isSelected(c.uid) ? (
                <span style={{ fontSize: "0.75rem", color: "var(--accent)", display: "flex", alignItems: "center", gap: 4 }}>
                    <FiCheck size={14} /> Added
                </span>
            ) : (
                <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={() => addRecipient(c)}>
                    Add
                </button>
            )}
        </div>
    );

    const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
        <button
            type="button"
            onClick={() => setTab(t)}
            style={{
                flex: 1, padding: "6px 8px", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                border: "none", borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                background: "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
            }}
        >
            {icon} {label}
        </button>
    );

    return (
        <div className="modal-overlay" onClick={close}>
            <div
                className="confirm-dialog"
                style={{ maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <FiShare2 size={18} style={{ color: "var(--accent)" }} />
                    <h3 style={{ margin: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</h3>
                    <button type="button" style={iconBtn} onClick={close} title="Close"><FiX size={18} /></button>
                </div>

                {!isPro ? (
                    <div style={{ textAlign: "center", padding: "20px 8px" }}>
                        <FiLock size={36} style={{ color: "var(--accent)", marginBottom: 10 }} />
                        <h3 style={{ marginBottom: 8 }}>File sharing is a Pro feature</h3>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                            Upgrade to Pro to securely share end-to-end encrypted files and folders with other Fort Sterling users.
                        </p>
                        <div className="confirm-actions" style={{ marginTop: 18 }}>
                            <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
                        </div>
                    </div>
                ) : done ? (
                    <div style={{ textAlign: "center", padding: "20px 8px" }}>
                        <FiCheck size={36} style={{ color: "var(--green, #22c55e)", marginBottom: 10 }} />
                        <h3 style={{ marginBottom: 8 }}>Shared successfully</h3>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                            Shared with {selected.map((s) => s.email).join(", ")}. They'll find it under <strong>Shared with me</strong>.
                        </p>
                        <div className="confirm-actions" style={{ marginTop: 18 }}>
                            <button type="button" className="btn-primary" onClick={onClose}>Done</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginBottom: 14 }}>
                            Files are re-encrypted so only the recipients you choose can open them.
                        </p>

                        {/* Search by email */}
                        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                            <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                <input
                                    type="email"
                                    placeholder="Search recipient email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={sharing}
                                    style={{ paddingLeft: 12 }}
                                    autoFocus
                                />
                            </div>
                            <button type="submit" className="btn-primary" disabled={searching || sharing || !email.trim()} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {searching ? <FiLoader size={14} className="spin" /> : <FiSearch size={14} />} Search
                            </button>
                        </form>

                        {searchResult && <div style={{ marginBottom: 10 }}>{renderContactRow(searchResult)}</div>}
                        {searchMessage && (
                            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 10 }}>{searchMessage}</p>
                        )}

                        {/* Selected recipients */}
                        {selected.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: 6 }}>
                                    Recipients ({selected.length})
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {selected.map((s) => (
                                        <span key={s.uid} style={{
                                            display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 10px",
                                            borderRadius: 999, border: "1px solid var(--accent)", fontSize: "0.75rem", color: "var(--text-primary)",
                                        }}>
                                            {s.email}
                                            <button type="button" style={{ ...iconBtn, padding: 0 }} onClick={() => removeRecipient(s.uid)} disabled={sharing} title="Remove">
                                                <FiX size={13} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                                    <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                        <input
                                            type="text"
                                            placeholder="Save recipients as a group (e.g. Family)"
                                            value={groupName}
                                            maxLength={60}
                                            onChange={(e) => setGroupName(e.target.value)}
                                            disabled={sharing || savingGroup}
                                            style={{ paddingLeft: 12 }}
                                        />
                                    </div>
                                    <button type="button" className="btn-secondary" onClick={handleSaveGroup} disabled={!groupName.trim() || savingGroup || sharing} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        {savingGroup ? <FiLoader size={14} className="spin" /> : <FiUserPlus size={14} />} Save group
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Frequent / Favorites / Groups */}
                        <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", marginBottom: 10 }}>
                            {tabBtn("frequent", "Frequent", <FiClock size={13} />)}
                            {tabBtn("favorites", "Favorites", <FiStar size={13} />)}
                            {tabBtn("groups", "Groups", <FiUsers size={13} />)}
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 80, maxHeight: 240, overflowY: "auto", marginBottom: 14 }}>
                            {loadingContacts ? (
                                <div style={{ textAlign: "center", padding: 16 }}><FiLoader className="spin" /></div>
                            ) : tab === "frequent" ? (
                                frequent.length === 0
                                    ? <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>People you share with most often will appear here.</p>
                                    : frequent.map((c) => renderContactRow(c, ` · shared ${c.shareCount}×`))
                            ) : tab === "favorites" ? (
                                favorites.length === 0
                                    ? <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Tap the star next to a recipient to add them to favorites.</p>
                                    : favorites.map((c) => renderContactRow(c))
                            ) : groups.length === 0 ? (
                                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>Add recipients above, then save them as a custom group.</p>
                            ) : (
                                groups.map((g) => (
                                    <div key={g.id} style={rowStyle}>
                                        <FiUsers size={18} style={{ color: "var(--accent)", flexShrink: 0 }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: "0.82rem", color: "var(--text-primary)", fontWeight: 600 }}>{g.name}</div>
                                            <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                {g.memberUids.map((uid) => contactByUid.get(uid)?.email || "Unknown").join(", ")}
                                            </div>
                                        </div>
                                        <button type="button" style={iconBtn} onClick={() => handleDeleteGroup(g)} title="Delete group">
                                            <FiTrash2 size={14} />
                                        </button>
                                        <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: "0.75rem" }} onClick={() => addGroup(g)}>
                                            Add all
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        {error && (
                            <p style={{ fontSize: "0.78rem", color: "var(--danger)", marginBottom: 10 }}>{error}</p>
                        )}

                        {sharing && progress && (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: 4 }}>
                                    {progress.label} {Math.round(progress.percent)}%
                                </div>
                                <div style={{ height: 6, borderRadius: 3, background: "var(--bg-input)", overflow: "hidden" }}>
                                    <div style={{ width: `${progress.percent}%`, height: "100%", background: "var(--accent)", transition: "width 0.2s ease" }} />
                                </div>
                            </div>
                        )}

                        <div className="confirm-actions">
                            <button type="button" className="btn-secondary" onClick={close} disabled={sharing}>Cancel</button>
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={handleShare}
                                disabled={sharing || selected.length === 0}
                                style={{ display: "flex", alignItems: "center", gap: 8 }}
                            >
                                {sharing ? <><FiLoader size={14} className="spin" /> Sharing…</> : <><FiShare2 size={14} /> Share</>}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

