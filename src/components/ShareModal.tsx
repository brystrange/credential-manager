import { useEffect, useMemo, useState } from "react";
import { FiX, FiLoader, FiLock, FiCheck, FiMoreHorizontal, FiChevronDown, FiChevronRight } from "react-icons/fi";
import { useSubscription } from "../context/SubscriptionContext";
import { useTaskToast } from "../context/TaskToastContext";
import {
    lookupRecipient,
    getShareContacts,
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

type Tab = "frequent" | "groups";

const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
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
    const [targetGroupId, setTargetGroupId] = useState("");
    const [savingGroup, setSavingGroup] = useState(false);

    // 3-dot dropdown menu state on contact row
    const [activeMenuUid, setActiveMenuUid] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
    const [showGroupPicker, setShowGroupPicker] = useState(false);
    const [creatingNewGroup, setCreatingNewGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState("");

    // Collapsible group cards (collapsed by default)
    const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
    const [sentRecipients, setSentRecipients] = useState<ShareRecipient[]>([]);
    const [sentGroupName, setSentGroupName] = useState<string | null>(null);

    const [sharing, setSharing] = useState(false);
    const [progress, setProgress] = useState<{ percent: number; label: string } | null>(null);
    const [error, setError] = useState("");
    const [done, setDone] = useState(false);

    const title = items.length === 1
        ? `Shared "${items[0].kind === "file" ? items[0].file.name : items[0].folder.name}"`
        : `Shared ${items.length} items`;

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
        setTargetGroupId("");
        setActiveMenuUid(null);
        setMenuPos(null);
        setShowGroupPicker(false);
        setCreatingNewGroup(false);
        setNewGroupName("");
        setError("");
        setDone(false);
        setProgress(null);
        setSentRecipients([]);
        setSentGroupName(null);
        setExpandedGroupIds(new Set());
        if (isPro) void refreshContacts();
    }, [isOpen, isPro]);

    const frequent = useMemo(
        () => contacts
            .slice()
            .sort((a, b) => b.shareCount - a.shareCount || (b.lastSharedAt ?? 0) - (a.lastSharedAt ?? 0) || a.email.localeCompare(b.email))
            .slice(0, 8),
        [contacts]
    );
    const contactByUid = useMemo(() => new Map(contacts.map((c) => [c.uid, c])), [contacts]);

    const getEmailForUid = (uid: string) => {
        const c = contactByUid.get(uid);
        if (c?.email) return c.email;
        const s = selected.find((sel) => sel.uid === uid);
        if (s?.email) return s.email;
        if (searchResult?.uid === uid) return searchResult.email;
        return "Unknown";
    };

    if (!isOpen) return null;

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

    const handleSaveOrAddToGroup = async () => {
        if (selected.length === 0) return;
        setSavingGroup(true);
        setError("");
        try {
            if (targetGroupId) {
                const target = groups.find((g) => g.id === targetGroupId);
                if (!target) return;
                const newUids = selected.map((s) => s.uid).filter((uid) => !target.memberUids.includes(uid));
                if (newUids.length === 0) {
                    setError(`Selected recipient(s) are already in "${target.name}".`);
                    return;
                }
                const merged = [...target.memberUids, ...newUids];
                await saveShareGroup(target.name, merged, target.id);
                setTargetGroupId("");
            } else {
                if (!groupName.trim()) return;
                await saveShareGroup(groupName.trim(), selected.map((s) => s.uid));
                setGroupName("");
            }
            await refreshContacts();
            setTab("groups");
        } catch (err) {
            setError(shareErrorMessage(err));
        } finally {
            setSavingGroup(false);
        }
    };

    const handleRemoveMemberFromGroup = async (g: ShareGroup, uidToRemove: string) => {
        const remainingUids = g.memberUids.filter((uid) => uid !== uidToRemove);
        setSavingGroup(true);
        setError("");
        try {
            if (remainingUids.length === 0) {
                const confirmed = window.confirm(`Remove user and delete the group "${g.name}"?`);
                if (!confirmed) {
                    setSavingGroup(false);
                    return;
                }
                await deleteShareGroup(g.id);
            } else {
                await saveShareGroup(g.name, remainingUids, g.id);
            }
            await refreshContacts();
        } catch (err) {
            setError(shareErrorMessage(err));
        } finally {
            setSavingGroup(false);
        }
    };

    const toggleGroupCollapse = (groupId: string) => {
        setExpandedGroupIds((prev) => {
            const next = new Set(prev);
            if (next.has(groupId)) {
                next.delete(groupId);
            } else {
                next.add(groupId);
            }
            return next;
        });
    };

    const sendToRecipients = async (recipients: ShareRecipient[], targetGroupName?: string) => {
        if (recipients.length === 0 || sharing) return;
        const noKey = recipients.filter((r) => !r.publicKeyJwk);
        if (noKey.length > 0) {
            setError(
                noKey.length === 1
                    ? `${noKey[0].email} hasn't registered their sharing keys yet. Ask them to sign in once to Fort Sterling.`
                    : `Skipped ${noKey.map((m) => m.email).join(", ")} — they haven't registered sharing keys yet.`
            );
            return;
        }

        setSharing(true);
        setError("");
        setSentRecipients(recipients);
        setSentGroupName(targetGroupName || null);
        setSelected([]);

        const itemLabel = items.length === 1
            ? `"${items[0].kind === "file" ? items[0].file.name : items[0].folder.name}"`
            : `${items.length} items`;
        const recipientLabel = targetGroupName || (recipients.length === 1 ? recipients[0].email : `${recipients.length} people`);
        const taskId = startTask({
            title: `Sending ${itemLabel}`,
            detail: `To ${recipientLabel}`,
            progress: 0,
        });

        try {
            await shareItems(items, recipients, (percent, label) => {
                setProgress({ percent, label });
                updateTask(taskId, { progress: percent, detail: label });
            });
            setDone(true);
            onShared?.();
            void refreshContacts();
            finishTask(taskId, {
                status: "success",
                title: `Sent ${itemLabel}`,
                detail: `To ${targetGroupName || recipients.map((s) => s.email).join(", ")}`,
            });
        } catch (err) {
            const message = shareErrorMessage(err);
            setError(message);
            finishTask(taskId, {
                status: "error",
                title: `Couldn't send ${itemLabel}`,
                detail: message,
            });
        } finally {
            setSharing(false);
        }
    };

    const handleShare = () => {
        void sendToRecipients(selected);
    };

    const handleSendToUser = (c: ShareRecipient) => {
        void sendToRecipients([c]);
    };

    const handleSendToGroup = (g: ShareGroup) => {
        const members = g.memberUids
            .map((uid) => contactByUid.get(uid) || selected.find((s) => s.uid === uid))
            .filter((c): c is ShareRecipient => !!c);
        if (members.length === 0) {
            setError(`Group "${g.name}" has no members.`);
            return;
        }
        void sendToRecipients(members, g.name);
    };

    const handleOpenMenu = (e: React.MouseEvent, c: ShareRecipient) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        if (activeMenuUid === c.uid) {
            setActiveMenuUid(null);
            setMenuPos(null);
            setShowGroupPicker(false);
            setCreatingNewGroup(false);
        } else {
            setActiveMenuUid(c.uid);
            setMenuPos({ top: rect.bottom + 4, right: Math.max(10, window.innerWidth - rect.right) });
            setShowGroupPicker(false);
            setCreatingNewGroup(false);
            setNewGroupName("");
        }
    };

    const handleAddUserToExistingGroup = async (g: ShareGroup, c: ShareRecipient) => {
        if (g.memberUids.includes(c.uid)) return;
        setSavingGroup(true);
        setError("");
        try {
            setContacts((prev) => (prev.some((p) => p.uid === c.uid) ? prev : [...prev, { ...c, favorite: false, shareCount: 0, lastSharedAt: null }]));
            const merged = [...g.memberUids, c.uid];
            await saveShareGroup(g.name, merged, g.id);
            await refreshContacts();
            setActiveMenuUid(null);
            setMenuPos(null);
            setShowGroupPicker(false);
        } catch (err) {
            setError(shareErrorMessage(err));
        } finally {
            setSavingGroup(false);
        }
    };

    const handleCreateGroupWithUser = async (c: ShareRecipient) => {
        if (!newGroupName.trim()) return;
        setSavingGroup(true);
        setError("");
        try {
            setContacts((prev) => (prev.some((p) => p.uid === c.uid) ? prev : [...prev, { ...c, favorite: false, shareCount: 0, lastSharedAt: null }]));
            await saveShareGroup(newGroupName.trim(), [c.uid]);
            await refreshContacts();
            setNewGroupName("");
            setCreatingNewGroup(false);
            setActiveMenuUid(null);
            setMenuPos(null);
            setShowGroupPicker(false);
        } catch (err) {
            setError(shareErrorMessage(err));
        } finally {
            setSavingGroup(false);
        }
    };

    const close = () => {
        if (sharing) return;
        onClose();
    };

    const renderContactRow = (c: ShareRecipient, extra?: React.ReactNode) => (
        <div key={c.uid} style={rowStyle}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.84rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.displayName || c.email}
                </div>
                <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.email}{extra}
                </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                    type="button"
                    className="btn-primary"
                    style={{ padding: "4px 14px", fontSize: "0.78rem" }}
                    onClick={() => handleSendToUser(c)}
                    disabled={sharing}
                >
                    Send
                </button>
                <button
                    type="button"
                    style={{
                        ...iconBtn,
                        padding: "5px 6px",
                        borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--border-color)",
                        background: activeMenuUid === c.uid ? "var(--bg-card)" : "transparent",
                    }}
                    onClick={(e) => handleOpenMenu(e, c)}
                    title="More options"
                >
                    <FiMoreHorizontal size={16} />
                </button>
            </div>
        </div>
    );

    const tabBtn = (t: Tab, label: string) => (
        <button
            type="button"
            onClick={() => setTab(t)}
            style={{
                flex: 1, padding: "8px", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
                background: "transparent", color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
            }}
        >
            {label}
        </button>
    );

    return (
        <div className="modal-overlay" onClick={close}>
            <div
                className="confirm-dialog"
                style={{ maxWidth: 500, maxHeight: "90vh", overflowY: "auto" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
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
                        <h3 style={{ marginBottom: 8 }}>Sent successfully</h3>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                            Sent to {sentGroupName || sentRecipients.map((s) => s.email).join(", ")}. They'll find it under <strong>Shared with me</strong>.
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
                        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                            <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                <input
                                    type="email"
                                    placeholder="Enter recipient email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    disabled={sharing}
                                    style={{ paddingLeft: 12 }}
                                    autoFocus
                                />
                            </div>
                            <button type="submit" className="btn-primary" disabled={searching || sharing || !email.trim()}>
                                {searching ? <FiLoader size={14} className="spin" /> : "Search"}
                            </button>
                        </form>

                        {searchResult && <div style={{ marginBottom: 12 }}>{renderContactRow(searchResult)}</div>}
                        {searchMessage && (
                            <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: 12 }}>{searchMessage}</p>
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
                                            display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px 4px 10px",
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
                                    {groups.length > 0 && (
                                        <select
                                            value={targetGroupId}
                                            onChange={(e) => {
                                                setTargetGroupId(e.target.value);
                                                if (e.target.value) setGroupName("");
                                            }}
                                            disabled={sharing || savingGroup}
                                            style={{
                                                padding: "6px 10px",
                                                fontSize: "0.78rem",
                                                borderRadius: "var(--radius-sm)",
                                                border: "1px solid var(--border-color)",
                                                background: "var(--bg-input)",
                                                color: "var(--text-primary)",
                                                maxWidth: 160,
                                            }}
                                        >
                                            <option value="">+ New group...</option>
                                            {groups.map((g) => (
                                                <option key={g.id} value={g.id}>
                                                    Add to group: {g.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {!targetGroupId ? (
                                        <div className="form-group" style={{ flex: 1, margin: 0 }}>
                                            <input
                                                type="text"
                                                placeholder="New group name (e.g. Work Team, Family)"
                                                value={groupName}
                                                maxLength={60}
                                                onChange={(e) => setGroupName(e.target.value)}
                                                disabled={sharing || savingGroup}
                                                style={{ paddingLeft: 12 }}
                                            />
                                        </div>
                                    ) : (
                                        <div style={{ flex: 1, display: "flex", alignItems: "center", fontSize: "0.78rem", color: "var(--text-secondary)", paddingLeft: 4 }}>
                                            Add selected to group <strong>&nbsp;{groups.find((g) => g.id === targetGroupId)?.name}</strong>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={handleSaveOrAddToGroup}
                                        disabled={!targetGroupId ? (!groupName.trim() || savingGroup || sharing) : (savingGroup || sharing)}
                                    >
                                        {savingGroup ? <FiLoader size={14} className="spin" /> : targetGroupId ? "Add to group" : "Create group"}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Tabs: Frequent / Groups */}
                        <div style={{ display: "flex", borderBottom: "1px solid var(--border-color)", marginBottom: 10 }}>
                            {tabBtn("frequent", "Frequent")}
                            {tabBtn("groups", "Groups")}
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: 6, minHeight: 70, maxHeight: 280, overflowY: "auto", marginBottom: 14 }}>
                            {loadingContacts ? (
                                <div style={{ textAlign: "center", padding: 16 }}><FiLoader className="spin" /></div>
                            ) : tab === "frequent" ? (
                                frequent.length === 0
                                    ? <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", padding: "10px 0" }}>People you share with will appear here.</p>
                                    : frequent.map((c) => renderContactRow(c, c.shareCount > 0 ? ` · shared ${c.shareCount}×` : undefined))
                            ) : groups.length === 0 ? (
                                <p style={{ fontSize: "0.78rem", color: "var(--text-secondary)", padding: "10px 0" }}>Add recipients above, then save them as a custom group.</p>
                            ) : (
                                groups.map((g) => {
                                    const isExpanded = expandedGroupIds.has(g.id);
                                    return (
                                        <div
                                            key={g.id}
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: 6,
                                                padding: "8px 12px",
                                                borderRadius: "var(--radius-sm)",
                                                border: "1px solid var(--border-color)",
                                                background: "var(--bg-input)",
                                            }}
                                        >
                                            {/* Header: Group Name and action */}
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 6,
                                                        cursor: "pointer",
                                                        userSelect: "none",
                                                    }}
                                                    onClick={() => toggleGroupCollapse(g.id)}
                                                    title={isExpanded ? "Collapse group" : "Expand group"}
                                                >
                                                    {isExpanded ? (
                                                        <FiChevronDown size={15} style={{ color: "var(--text-secondary)" }} />
                                                    ) : (
                                                        <FiChevronRight size={15} style={{ color: "var(--text-secondary)" }} />
                                                    )}
                                                    <span style={{ fontSize: "0.85rem", color: "var(--text-primary)", fontWeight: 700 }}>
                                                        {g.name}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    style={{
                                                        background: "transparent",
                                                        border: "none",
                                                        color: "var(--accent)",
                                                        textDecoration: "underline",
                                                        fontSize: "0.76rem",
                                                        fontWeight: 600,
                                                        padding: "2px 0",
                                                        cursor: sharing ? "not-allowed" : "pointer",
                                                        opacity: sharing ? 0.6 : 1,
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSendToGroup(g);
                                                    }}
                                                    disabled={sharing}
                                                    title={`Send file directly to all members of ${g.name}`}
                                                >
                                                    Send to all
                                                </button>
                                            </div>

                                            {/* Members pills with x icon on the right */}
                                            {isExpanded && (
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", paddingTop: 2 }}>
                                                    {g.memberUids.map((uid) => (
                                                        <span
                                                            key={uid}
                                                            style={{
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                gap: 6,
                                                                padding: "3px 8px 3px 10px",
                                                                borderRadius: 999,
                                                                border: "1px solid var(--border-color)",
                                                                background: "var(--bg-card)",
                                                                fontSize: "0.75rem",
                                                                color: "var(--text-primary)",
                                                            }}
                                                        >
                                                            <span>{getEmailForUid(uid)}</span>
                                                            <button
                                                                type="button"
                                                                style={{ ...iconBtn, padding: 0, color: "var(--text-secondary)" }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    void handleRemoveMemberFromGroup(g, uid);
                                                                }}
                                                                title={`Remove ${getEmailForUid(uid)} from ${g.name}`}
                                                            >
                                                                <FiX size={13} />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
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
                                style={{ minWidth: 90 }}
                            >
                                {sharing ? <><FiLoader size={14} className="spin" /> Sending…</> : "Send"}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {activeMenuUid && menuPos && (
                <>
                    <div
                        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuUid(null);
                            setMenuPos(null);
                            setShowGroupPicker(false);
                            setCreatingNewGroup(false);
                        }}
                    />
                    <div
                        className="context-menu"
                        style={{
                            position: "fixed",
                            top: menuPos.top,
                            right: menuPos.right,
                            zIndex: 9999,
                            minWidth: 170,
                            padding: showGroupPicker ? "8px" : "4px 0",
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {!showGroupPicker ? (
                            <button
                                type="button"
                                className="context-menu-item"
                                style={{ padding: "8px 14px", fontSize: "0.78rem" }}
                                onClick={() => setShowGroupPicker(true)}
                            >
                                <span>Add to group</span>
                                <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--text-secondary)" }}>▸</span>
                            </button>
                        ) : (
                            <div style={{ minWidth: 190 }}>
                                <div style={{ fontSize: "0.70rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6, padding: "2px 4px" }}>
                                    Add to Group
                                </div>

                                {groups.length === 0 ? (
                                    <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", fontStyle: "italic", padding: "4px" }}>
                                        No groups yet.
                                    </div>
                                ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 130, overflowY: "auto", marginBottom: 6 }}>
                                        {groups.map((g) => {
                                            const activeContact = contacts.find((c) => c.uid === activeMenuUid) || (searchResult?.uid === activeMenuUid ? searchResult : null);
                                            const inGroup = activeContact ? g.memberUids.includes(activeContact.uid) : false;
                                            return (
                                                <button
                                                    key={g.id}
                                                    type="button"
                                                    disabled={inGroup || savingGroup}
                                                    onClick={() => {
                                                        if (activeContact) void handleAddUserToExistingGroup(g, activeContact);
                                                    }}
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        justifyContent: "space-between",
                                                        padding: "6px 8px",
                                                        borderRadius: "var(--radius-sm)",
                                                        border: "none",
                                                        background: "transparent",
                                                        color: inGroup ? "var(--text-secondary)" : "var(--text-primary)",
                                                        fontSize: "0.76rem",
                                                        cursor: inGroup ? "default" : "pointer",
                                                        textAlign: "left",
                                                        width: "100%",
                                                    }}
                                                    onMouseEnter={(e) => {
                                                        if (!inGroup) e.currentTarget.style.background = "var(--bg-input)";
                                                    }}
                                                    onMouseLeave={(e) => {
                                                        e.currentTarget.style.background = "transparent";
                                                    }}
                                                >
                                                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                        {g.name}
                                                    </span>
                                                    {inGroup && (
                                                        <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)" }}>In group</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {creatingNewGroup ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                                        <input
                                            type="text"
                                            placeholder="New group name"
                                            value={newGroupName}
                                            onChange={(e) => setNewGroupName(e.target.value)}
                                            maxLength={60}
                                            autoFocus
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") {
                                                    e.preventDefault();
                                                    const activeContact = contacts.find((c) => c.uid === activeMenuUid) || (searchResult?.uid === activeMenuUid ? searchResult : null);
                                                    if (activeContact) void handleCreateGroupWithUser(activeContact);
                                                }
                                            }}
                                            style={{
                                                padding: "4px 8px",
                                                fontSize: "0.74rem",
                                                borderRadius: "var(--radius-sm)",
                                                border: "1px solid var(--border-color)",
                                                background: "var(--bg-input)",
                                                color: "var(--text-primary)",
                                            }}
                                        />
                                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                                            <button
                                                type="button"
                                                className="btn-secondary"
                                                style={{ padding: "2px 8px", fontSize: "0.70rem" }}
                                                onClick={() => setCreatingNewGroup(false)}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-primary"
                                                style={{ padding: "2px 10px", fontSize: "0.70rem" }}
                                                onClick={() => {
                                                    const activeContact = contacts.find((c) => c.uid === activeMenuUid) || (searchResult?.uid === activeMenuUid ? searchResult : null);
                                                    if (activeContact) void handleCreateGroupWithUser(activeContact);
                                                }}
                                                disabled={!newGroupName.trim() || savingGroup}
                                            >
                                                Create
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        style={{
                                            width: "100%",
                                            padding: "6px 8px",
                                            border: "none",
                                            borderRadius: "var(--radius-sm)",
                                            background: "transparent",
                                            color: "var(--accent)",
                                            fontSize: "0.74rem",
                                            fontWeight: 600,
                                            textAlign: "left",
                                            cursor: "pointer",
                                            borderTop: "1px solid var(--border-color)",
                                            marginTop: 2,
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-input)")}
                                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                                        onClick={() => setCreatingNewGroup(true)}
                                    >
                                        + Create new group
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
