import { useEffect, useMemo, useState } from "react";
import { FiX, FiLoader, FiLock, FiCheck } from "react-icons/fi";
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

    // Group editing state
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
    const [editGroupName, setEditGroupName] = useState("");
    const [editMemberUids, setEditMemberUids] = useState<string[]>([]);
    const [editAddEmail, setEditAddEmail] = useState("");
    const [editSearching, setEditSearching] = useState(false);
    const [editError, setEditError] = useState("");

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
        setTargetGroupId("");
        setEditingGroupId(null);
        setEditGroupName("");
        setEditMemberUids([]);
        setEditAddEmail("");
        setEditError("");
        setError("");
        setDone(false);
        setProgress(null);
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

    const isSelected = (uid: string) => selected.some((s) => s.uid === uid);

    const addRecipient = (r: ShareRecipient) => {
        setError("");
        if (!r.publicKeyJwk) {
            setError(`${r.email} hasn't registered their sharing keys yet. Because file sharing was just deployed on the server, please sign in to this account once to activate end-to-end encryption.`);
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

    const handleAddSelectedToGroup = async (g: ShareGroup) => {
        const unadded = selected.filter((s) => !g.memberUids.includes(s.uid));
        if (unadded.length === 0) return;
        setSavingGroup(true);
        setError("");
        try {
            const merged = Array.from(new Set([...g.memberUids, ...unadded.map((s) => s.uid)]));
            await saveShareGroup(g.name, merged, g.id);
            await refreshContacts();
        } catch (err) {
            setError(shareErrorMessage(err));
        } finally {
            setSavingGroup(false);
        }
    };

    const startEditGroup = (g: ShareGroup) => {
        setEditingGroupId(g.id);
        setEditGroupName(g.name);
        setEditMemberUids([...g.memberUids]);
        setEditAddEmail("");
        setEditError("");
    };

    const cancelEditGroup = () => {
        setEditingGroupId(null);
        setEditGroupName("");
        setEditMemberUids([]);
        setEditAddEmail("");
        setEditError("");
    };

    const handleRemoveMemberFromEdit = (uid: string) => {
        setEditMemberUids((prev) => prev.filter((id) => id !== uid));
    };

    const handleAddEmailToEdit = async () => {
        const raw = editAddEmail.trim().toLowerCase();
        if (!raw) return;
        setEditError("");
        setEditSearching(true);
        try {
            const res = await lookupRecipient(raw);
            if (!res) {
                setEditError(`No Fort Sterling account found for "${raw}".`);
                return;
            }
            if (editMemberUids.includes(res.uid)) {
                setEditError(`${res.email} is already in this group.`);
                return;
            }
            setContacts((prev) => (prev.some((c) => c.uid === res.uid) ? prev : [...prev, { ...res, favorite: false, shareCount: 0, lastSharedAt: null }]));
            setEditMemberUids((prev) => [...prev, res.uid]);
            setEditAddEmail("");
        } catch (err) {
            setEditError(shareErrorMessage(err));
        } finally {
            setEditSearching(false);
        }
    };

    const handleSaveGroupEdit = async (g: ShareGroup) => {
        if (!editGroupName.trim()) {
            setEditError("Group name cannot be empty.");
            return;
        }
        if (editMemberUids.length === 0) {
            setEditError("Group must have at least one member.");
            return;
        }
        setSavingGroup(true);
        setEditError("");
        try {
            await saveShareGroup(editGroupName.trim(), editMemberUids, g.id);
            await refreshContacts();
            setEditingGroupId(null);
        } catch (err) {
            setEditError(shareErrorMessage(err));
        } finally {
            setSavingGroup(false);
        }
    };

    const handleDeleteGroup = async (g: ShareGroup) => {
        if (!window.confirm(`Delete the group "${g.name}"?`)) return;
        try {
            await deleteShareGroup(g.id);
            if (editingGroupId === g.id) setEditingGroupId(null);
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
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.84rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.displayName || c.email}
                </div>
                <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.email}{extra}
                </div>
            </div>
            {isSelected(c.uid) ? (
                <span style={{ fontSize: "0.78rem", color: "var(--accent)", fontWeight: 600 }}>
                    Added
                </span>
            ) : (
                <button type="button" className="btn-secondary" style={{ padding: "4px 12px", fontSize: "0.78rem" }} onClick={() => addRecipient(c)}>
                    Add
                </button>
            )}
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
                                                maxWidth: 150,
                                            }}
                                        >
                                            <option value="">New group...</option>
                                            {groups.map((g) => (
                                                <option key={g.id} value={g.id}>
                                                    Add to: {g.name}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {!targetGroupId ? (
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
                                    ) : (
                                        <div style={{ flex: 1, display: "flex", alignItems: "center", fontSize: "0.78rem", color: "var(--text-secondary)", paddingLeft: 4 }}>
                                            Add selected to <strong>&nbsp;{groups.find((g) => g.id === targetGroupId)?.name}</strong>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={handleSaveOrAddToGroup}
                                        disabled={!targetGroupId ? (!groupName.trim() || savingGroup || sharing) : (savingGroup || sharing)}
                                    >
                                        {savingGroup ? <FiLoader size={14} className="spin" /> : targetGroupId ? "Add to group" : "Save group"}
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
                                    const isEditing = editingGroupId === g.id;
                                    const unaddedSelected = selected.filter((s) => !g.memberUids.includes(s.uid));

                                    if (isEditing) {
                                        return (
                                            <div key={g.id} style={{ ...rowStyle, flexDirection: "column", alignItems: "stretch", gap: 8, padding: "10px 12px" }}>
                                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                                    <input
                                                        type="text"
                                                        value={editGroupName}
                                                        onChange={(e) => setEditGroupName(e.target.value)}
                                                        maxLength={60}
                                                        placeholder="Group name"
                                                        style={{
                                                            flex: 1,
                                                            padding: "5px 10px",
                                                            fontSize: "0.82rem",
                                                            fontWeight: 600,
                                                            borderRadius: "var(--radius-sm)",
                                                            border: "1px solid var(--border-color)",
                                                            background: "var(--bg-input)",
                                                            color: "var(--text-primary)",
                                                        }}
                                                    />
                                                </div>

                                                <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                                                    Members ({editMemberUids.length})
                                                </div>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 90, overflowY: "auto" }}>
                                                    {editMemberUids.map((uid) => (
                                                        <span
                                                            key={uid}
                                                            style={{
                                                                display: "inline-flex",
                                                                alignItems: "center",
                                                                gap: 6,
                                                                padding: "3px 8px",
                                                                borderRadius: 999,
                                                                border: "1px solid var(--border-color)",
                                                                background: "var(--bg-card)",
                                                                fontSize: "0.74rem",
                                                                color: "var(--text-primary)",
                                                            }}
                                                        >
                                                            {getEmailForUid(uid)}
                                                            <button
                                                                type="button"
                                                                style={{ ...iconBtn, padding: 0 }}
                                                                onClick={() => handleRemoveMemberFromEdit(uid)}
                                                                title="Remove from group"
                                                            >
                                                                <FiX size={12} />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>

                                                <div style={{ display: "flex", gap: 6 }}>
                                                    <input
                                                        type="email"
                                                        placeholder="Add user email to group"
                                                        value={editAddEmail}
                                                        onChange={(e) => {
                                                            setEditAddEmail(e.target.value);
                                                            setEditError("");
                                                        }}
                                                        onKeyDown={(e) => {
                                                            if (e.key === "Enter") {
                                                                e.preventDefault();
                                                                void handleAddEmailToEdit();
                                                            }
                                                        }}
                                                        style={{
                                                            flex: 1,
                                                            padding: "5px 10px",
                                                            fontSize: "0.76rem",
                                                            borderRadius: "var(--radius-sm)",
                                                            border: "1px solid var(--border-color)",
                                                            background: "var(--bg-input)",
                                                            color: "var(--text-primary)",
                                                        }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn-secondary"
                                                        style={{ padding: "4px 10px", fontSize: "0.76rem" }}
                                                        onClick={handleAddEmailToEdit}
                                                        disabled={editSearching || !editAddEmail.trim()}
                                                    >
                                                        {editSearching ? <FiLoader size={12} className="spin" /> : "Add"}
                                                    </button>
                                                </div>

                                                {editError && (
                                                    <div style={{ fontSize: "0.72rem", color: "var(--danger)" }}>{editError}</div>
                                                )}

                                                <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 4 }}>
                                                    <button
                                                        type="button"
                                                        className="btn-secondary"
                                                        style={{ padding: "4px 10px", fontSize: "0.76rem" }}
                                                        onClick={cancelEditGroup}
                                                        disabled={savingGroup}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn-primary"
                                                        style={{ padding: "4px 12px", fontSize: "0.76rem" }}
                                                        onClick={() => handleSaveGroupEdit(g)}
                                                        disabled={savingGroup || !editGroupName.trim() || editMemberUids.length === 0}
                                                    >
                                                        {savingGroup ? <FiLoader size={12} className="spin" /> : "Save"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={g.id} style={rowStyle}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: "0.84rem", color: "var(--text-primary)", fontWeight: 600 }}>{g.name}</div>
                                                <div style={{ fontSize: "0.74rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                                    {g.memberUids.map((uid) => getEmailForUid(uid)).join(", ")}
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                                                {unaddedSelected.length > 0 && (
                                                    <button
                                                        type="button"
                                                        className="btn-secondary"
                                                        style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--accent)" }}
                                                        onClick={() => handleAddSelectedToGroup(g)}
                                                        disabled={savingGroup}
                                                        title={`Add ${unaddedSelected.map((s) => s.email).join(", ")} to ${g.name}`}
                                                    >
                                                        + Add to group
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                                                    onClick={() => startEditGroup(g)}
                                                    title="Edit members or rename"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    style={{ padding: "4px 8px", fontSize: "0.75rem", color: "var(--danger)" }}
                                                    onClick={() => handleDeleteGroup(g)}
                                                    title="Delete group"
                                                >
                                                    Delete
                                                </button>
                                                <button type="button" className="btn-secondary" style={{ padding: "4px 12px", fontSize: "0.75rem" }} onClick={() => addGroup(g)}>
                                                    Add all
                                                </button>
                                            </div>
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
                                {sharing ? <><FiLoader size={14} className="spin" /> Sharing…</> : "Share"}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
