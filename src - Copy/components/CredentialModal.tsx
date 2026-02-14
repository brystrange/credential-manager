import { useState, useEffect } from "react";
import type { CredentialInput } from "../services/credentialService";
import PlatformPicker from "./PlatformPicker";
import {
    FiX,
    FiMail,
    FiUser,
    FiLock,
    FiMessageSquare,
    FiEye,
    FiEyeOff,
} from "react-icons/fi";

interface CredentialModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CredentialInput) => void;
    initialData?: CredentialInput & { id?: string };
    loading?: boolean;
    existingPlatforms?: string[];
}

export default function CredentialModal({
    isOpen,
    onClose,
    onSubmit,
    initialData,
    loading,
    existingPlatforms = [],
}: CredentialModalProps) {
    const [platform, setPlatform] = useState("");
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [comment, setComment] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (initialData) {
            setPlatform(initialData.platform);
            setEmail(initialData.email);
            setUsername(initialData.username);
            setPassword(initialData.password);
            setComment(initialData.comment);
        } else {
            setPlatform("");
            setEmail("");
            setUsername("");
            setPassword("");
            setComment("");
        }
        setShowPassword(false);
    }, [initialData, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!platform.trim()) return;
        onSubmit({ platform, email, username, password, comment });
    };

    if (!isOpen) return null;

    const isEditing = !!initialData?.id;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{isEditing ? "Edit Credential" : "New Credential"}</h2>
                    <button className="modal-close" onClick={onClose}>
                        <FiX size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    {/* Platform picker replaces the old text input */}
                    <div className="form-group platform-form-group">
                        <PlatformPicker
                            value={platform}
                            onChange={setPlatform}
                            existingPlatforms={existingPlatforms}
                            disabled={isEditing}
                        />
                    </div>

                    <div className="form-group">
                        <div className="input-icon">
                            <FiMail size={18} />
                        </div>
                        <input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <div className="input-icon">
                            <FiUser size={18} />
                        </div>
                        <input
                            type="text"
                            placeholder="Username (optional)"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <div className="input-icon">
                            <FiLock size={18} />
                        </div>
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            className="input-suffix"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                    </div>

                    <div className="form-group">
                        <div className="input-icon textarea-icon">
                            <FiMessageSquare size={18} />
                        </div>
                        <textarea
                            placeholder="Comment (optional)"
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            rows={3}
                        />
                    </div>

                    <button type="submit" className="modal-submit" disabled={loading || !platform.trim()}>
                        {loading ? (
                            <span className="spinner" />
                        ) : isEditing ? (
                            "Save Changes"
                        ) : (
                            "Add Credential"
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
