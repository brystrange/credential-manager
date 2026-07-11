import { useState } from "react";
import type { Credential } from "../services/credentialService";
import type { Platform } from "../services/platformService";
import { findPlatformByName } from "../services/platformService";
import {
    FiEdit2,
    FiTrash2,
    FiClock,
    FiEye,
    FiEyeOff,
    FiCopy,
    FiMail,
    FiUser,
    FiMessageSquare,
    FiHash,
} from "react-icons/fi";

interface CredentialCardProps {
    credential: Credential;
    platforms: Platform[];
    onEdit: (credential: Credential) => void;
    onDelete: (credential: Credential) => void;
    onHistory: (credential: Credential) => void;
}

export default function CredentialCard({
    credential,
    platforms,
    onEdit,
    onDelete,
    onHistory,
}: CredentialCardProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [showPin, setShowPin] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [imgError, setImgError] = useState(false);
    const [loadingAction, setLoadingAction] = useState<"edit" | "delete" | "history" | null>(null);

    const handleActionClick = async (
        action: "edit" | "delete" | "history",
        fn: () => void
    ) => {
        if (loadingAction) return;
        setLoadingAction(action);
        fn();
        await new Promise((r) => setTimeout(r, 450));
        setLoadingAction(null);
    };

    const platform = findPlatformByName(platforms, credential.platform);

    const copyToClipboard = async (text: string, field: string) => {
        await navigator.clipboard.writeText(text);
        setCopied(field);
        setTimeout(() => setCopied(null), 1500);
    };

    const getPlatformInitial = (name: string) => {
        return name.charAt(0).toUpperCase();
    };

    const getPlatformColor = (name: string) => {
        if (platform) return platform.color;
        const colors = [
            "#6366f1",
            "#8b5cf6",
            "#a855f7",
            "#ec4899",
            "#f43f5e",
            "#f97316",
            "#eab308",
            "#22c55e",
            "#14b8a6",
            "#06b6d4",
            "#3b82f6",
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
        return colors[Math.abs(hash) % colors.length];
    };

    return (
        <div className="credential-card">
            <div className="card-header">
                {platform && platform.logoUrl && !imgError ? (
                    <div className="platform-icon platform-icon-img">
                        <img
                            src={platform.logoUrl}
                            alt={platform.name}
                            className="platform-logo-img"
                            onError={() => setImgError(true)}
                        />
                    </div>
                ) : (
                    <div
                        className="platform-icon"
                        style={{ backgroundColor: getPlatformColor(credential.platform) }}
                    >
                        {getPlatformInitial(credential.platform)}
                    </div>
                )}
                <div className="platform-info">
                    <h3 className="platform-name">
                        {credential.accountName || credential.platform}
                    </h3>
                    {credential.accountName && (
                        <span className="platform-subtitle">{credential.platform}</span>
                    )}
                    <span className="card-date">
                        Updated {credential.updatedAt.toLocaleDateString()}
                    </span>
                </div>
                <div className="card-actions">
                    <button
                        className="icon-btn"
                        onClick={() => handleActionClick("history", () => onHistory(credential))}
                        title="View History"
                        disabled={!!loadingAction}
                    >
                        {loadingAction === "history"
                            ? <span className="spinner" style={{ width: 13, height: 13 }} />
                            : <FiClock size={16} />}
                    </button>
                    <button
                        className="icon-btn"
                        onClick={() => handleActionClick("edit", () => onEdit(credential))}
                        title="Edit"
                        disabled={!!loadingAction}
                    >
                        {loadingAction === "edit"
                            ? <span className="spinner" style={{ width: 13, height: 13 }} />
                            : <FiEdit2 size={16} />}
                    </button>
                    <button
                        className="icon-btn danger"
                        onClick={() => handleActionClick("delete", () => onDelete(credential))}
                        title="Delete"
                        disabled={!!loadingAction}
                    >
                        {loadingAction === "delete"
                            ? <span className="spinner" style={{ width: 13, height: 13 }} />
                            : <FiTrash2 size={16} />}
                    </button>
                </div>
            </div>

            <div className="card-body">
                <div className="field-row">
                    <FiMail size={14} className="field-icon" />
                    <span className="field-label">Email</span>
                    <span className="field-value">{credential.email}</span>
                    <button
                        className={`copy-btn ${copied === "email" ? "copied" : ""}`}
                        onClick={() => copyToClipboard(credential.email, "email")}
                        title="Copy"
                    >
                        <FiCopy size={12} />
                        {copied === "email" && <span className="copy-toast">Copied!</span>}
                    </button>
                </div>

                {credential.username && (
                    <div className="field-row">
                        <FiUser size={14} className="field-icon" />
                        <span className="field-label">Username</span>
                        <span className="field-value">{credential.username}</span>
                        <button
                            className={`copy-btn ${copied === "username" ? "copied" : ""}`}
                            onClick={() => copyToClipboard(credential.username, "username")}
                            title="Copy"
                        >
                            <FiCopy size={12} />
                            {copied === "username" && (
                                <span className="copy-toast">Copied!</span>
                            )}
                        </button>
                    </div>
                )}

                <div className="field-row">
                    <FiEye size={14} className="field-icon" />
                    <span className="field-label">Password</span>
                    <span className="field-value mono">
                        {showPassword ? credential.password : "•".repeat(credential.password?.length || 0)}
                    </span>
                    <button
                        className="copy-btn"
                        onClick={() => setShowPassword(!showPassword)}
                        title={showPassword ? "Hide" : "Show"}
                    >
                        {showPassword ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                    </button>
                    <button
                        className={`copy-btn ${copied === "password" ? "copied" : ""}`}
                        onClick={() => copyToClipboard(credential.password, "password")}
                        title="Copy"
                    >
                        <FiCopy size={12} />
                        {copied === "password" && (
                            <span className="copy-toast">Copied!</span>
                        )}
                    </button>
                </div>

                {credential.pin && (
                    <div className="field-row">
                        <FiHash size={14} className="field-icon" />
                        <span className="field-label">Pin</span>
                        <span className="field-value mono">
                            {showPin ? credential.pin : "•".repeat(credential.pin?.length || 0)}
                        </span>
                        <button
                            className="copy-btn"
                            onClick={() => setShowPin(!showPin)}
                            title={showPin ? "Hide" : "Show"}
                        >
                            {showPin ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                        </button>
                        <button
                            className={`copy-btn ${copied === "pin" ? "copied" : ""}`}
                            onClick={() => copyToClipboard(credential.pin!, "pin")}
                            title="Copy"
                        >
                            <FiCopy size={12} />
                            {copied === "pin" && (
                                <span className="copy-toast">Copied!</span>
                            )}
                        </button>
                    </div>
                )}

                {credential.comment && (
                    <div className="field-row">
                        <FiMessageSquare size={14} className="field-icon" />
                        <span className="field-label">Note</span>
                        <span className="field-value comment">{credential.comment}</span>
                    </div>
                )}
            </div>
        </div>
    );
}