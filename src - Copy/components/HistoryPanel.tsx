import { useEffect, useState } from "react";
import type { HistoryEntry } from "../services/credentialService";
import { getHistory } from "../services/credentialService";
import { format } from "date-fns";
import {
    FiX,
    FiPlus,
    FiEdit,
    FiClock,
} from "react-icons/fi";

interface HistoryPanelProps {
    isOpen: boolean;
    onClose: () => void;
    credentialId: string;
    platformName: string;
}

export default function HistoryPanel({
    isOpen,
    onClose,
    credentialId,
    platformName,
}: HistoryPanelProps) {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && credentialId) {
            setLoading(true);
            getHistory(credentialId)
                .then(setHistory)
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [isOpen, credentialId]);

    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="history-panel"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <div>
                        <h2>History</h2>
                        <span className="history-subtitle">{platformName}</span>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        <FiX size={20} />
                    </button>
                </div>

                <div className="history-content">
                    {loading ? (
                        <div className="history-loading">
                            <span className="spinner" />
                            <p>Loading history…</p>
                        </div>
                    ) : history.length === 0 ? (
                        <div className="history-empty">
                            <FiClock size={40} />
                            <p>No history available</p>
                        </div>
                    ) : (
                        <div className="timeline">
                            {history.map((entry, index) => (
                                <div
                                    key={entry.id}
                                    className={`timeline-item ${entry.action}`}
                                    style={{ animationDelay: `${index * 0.08}s` }}
                                >
                                    <div className="timeline-dot">
                                        {entry.action === "created" ? (
                                            <FiPlus size={12} />
                                        ) : (
                                            <FiEdit size={12} />
                                        )}
                                    </div>
                                    <div className="timeline-line" />
                                    <div className="timeline-card">
                                        <div className="timeline-header">
                                            <span
                                                className={`timeline-badge ${entry.action}`}
                                            >
                                                {entry.action === "created"
                                                    ? "Created"
                                                    : "Updated"}
                                            </span>
                                            <span className="timeline-date">
                                                {format(
                                                    entry.timestamp,
                                                    "MMM d, yyyy 'at' h:mm a"
                                                )}
                                            </span>
                                        </div>

                                        {entry.action === "updated" &&
                                            entry.changes &&
                                            entry.changes.length > 0 && (
                                                <div className="timeline-changes">
                                                    <span className="changes-label">
                                                        Changed:
                                                    </span>
                                                    {entry.changes.map((field) => (
                                                        <span key={field} className="change-tag">
                                                            {field}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}

                                        <div className="timeline-snapshot">
                                            <div className="snapshot-row">
                                                <span className="snapshot-label">Platform</span>
                                                <span className="snapshot-value">
                                                    {entry.platform}
                                                </span>
                                            </div>
                                            <div className="snapshot-row">
                                                <span className="snapshot-label">Email</span>
                                                <span className="snapshot-value">
                                                    {entry.email}
                                                </span>
                                            </div>
                                            {entry.username && (
                                                <div className="snapshot-row">
                                                    <span className="snapshot-label">
                                                        Username
                                                    </span>
                                                    <span className="snapshot-value">
                                                        {entry.username}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="snapshot-row">
                                                <span className="snapshot-label">Password</span>
                                                <span className="snapshot-value mono">
                                                    {entry.password}
                                                </span>
                                            </div>
                                            {entry.comment && (
                                                <div className="snapshot-row">
                                                    <span className="snapshot-label">Comment</span>
                                                    <span className="snapshot-value">
                                                        {entry.comment}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
