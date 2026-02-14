import { useState } from "react";
import type { Credential } from "../services/credentialService";
import { findPlatformByName, getPlatformLogoUrl } from "../data/platformData";
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
} from "react-icons/fi";

interface CredentialCardProps {
    credential: Credential;
    onEdit: (credential: Credential) => void;
    onDelete: (credential: Credential) => void;
    onHistory: (credential: Credential) => void;
}

export default function CredentialCard({
    credential,
    onEdit,
    onDelete,
    onHistory,
}: CredentialCardProps) {
    const [showPassword, setShowPassword] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);
    const [imgError, setImgError] = useState(false);

    const platform = findPlatformByName(credential.platform);

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
                {platform && !imgError ? (
                    <div className="platform-icon platform-icon-img">
                        <img
                            src={getPlatformLogoUrl(platform.domain)}
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
                    <h3 className="platform-name">{credential.platform}</h3>
                    <span className="card-date">
                        Updated {credential.updatedAt.toLocaleDateString()}
                    </span>
                </div>
                <div className="card-actions">
                    <button
                        className="icon-btn"
                        onClick={() => onHistory(credential)}
                        title="View History"
                    >
                        <FiClock size={16} />
                    </button>
                    <button
                        className="icon-btn"
                        onClick={() => onEdit(credential)}
                        title="Edit"
                    >
                        <FiEdit2 size={16} />
                    </button>
                    <button
                        className="icon-btn danger"
                        onClick={() => onDelete(credential)}
                        title="Delete"
                    >
                        <FiTrash2 size={16} />
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
                        {showPassword ? credential.password : "••••••••••••"}
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
