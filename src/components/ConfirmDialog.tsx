import { FiAlertTriangle } from "react-icons/fi";

interface ConfirmDialogProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

export default function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = "Delete",
    onConfirm,
    onCancel,
    loading,
}: ConfirmDialogProps) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <h3>{title}</h3>
                <p>{message}</p>
                <div className="confirm-actions">
                    <button className="btn-secondary" onClick={onCancel} disabled={loading}>
                        Cancel
                    </button>
                    <button
                        className="btn-danger"
                        onClick={onConfirm}
                        disabled={loading}
                    >
                        {loading ? "Deleting..." : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}