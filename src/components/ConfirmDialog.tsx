import { FiLoader } from "react-icons/fi";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
    loadingMessage?: string;
}

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = "Delete",
    onConfirm,
    onCancel,
    loading,
    loadingMessage,
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <h3>{title}</h3>
                <p>{message}</p>
                {loading && loadingMessage && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px', fontStyle: 'italic', display: 'flex', alignItems: 'center' }}>
                        {loadingMessage}
                    </p>
                )}
                <div className="confirm-actions">
                    <button className="btn-secondary" onClick={onCancel} disabled={loading}>
                        Cancel
                    </button>
                    <button
                        className="btn-danger"
                        onClick={onConfirm}
                        disabled={loading}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        {loading ? <><FiLoader size={16} className="spin" /> Deleting...</> : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}