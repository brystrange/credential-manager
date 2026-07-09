import { useState, useEffect } from "react";
import type { CredentialInput } from "../services/credentialService";
import type { Platform } from "../services/platformService";
import PlatformPicker from "./PlatformPicker";
import {
    FiX,
    FiMail,
    FiUser,
    FiLock,
    FiMessageSquare,
    FiEye,
    FiEyeOff,
    FiTag,
    FiHash,
} from "react-icons/fi";

interface CredentialModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: CredentialInput) => void;
    initialData?: CredentialInput & { id?: string };
    loading?: boolean;
    existingPlatforms?: string[];
    platforms: Platform[];
    isAtLimit?: boolean;
    onUpgrade?: () => void;
}

/**
 * On mobile, when an input/textarea receives focus the virtual keyboard
 * slides up from the bottom and can obscure the focused element.
 * scrollIntoView({ block: "nearest" }) asks the browser to reveal
 * the element with the minimum scroll — keeps it in view without
 * jumping more than necessary.
 */
function handleMobileFocus(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (window.matchMedia("(max-width: 768px)").matches) {
        const el = e.currentTarget;
        setTimeout(() => {
            el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 150);
    }
}

export default function CredentialModal({
    isOpen,
    onClose,
    onSubmit,
    initialData,
    loading,
    existingPlatforms = [],
    platforms,
    isAtLimit = false,
    onUpgrade,
}: CredentialModalProps) {
    const [platform, setPlatform] = useState("");
    const [accountName, setAccountName] = useState("");
    const [email, setEmail] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [pin, setPin] = useState("");
    const [comment, setComment] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showPin, setShowPin] = useState(false);

    useEffect(() => {
        if (initialData) {
            setPlatform(initialData.platform);
            setAccountName(initialData.accountName || "");
            setEmail(initialData.email);
            setUsername(initialData.username);
            setPassword(initialData.password);
            setPin(initialData.pin || "");
            setComment(initialData.comment);
        } else {
            setPlatform("");
            setAccountName("");
            setEmail("");
            setUsername("");
            setPassword("");
            setPin("");
            setComment("");
        }
        setShowPassword(false);
        setShowPin(false);
    }, [initialData, isOpen]);

    // Disable body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "unset";
        }
        return () => {
            document.body.style.overflow = "unset";
        };
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!platform.trim()) return;
        // Safety net: block new credential creation when at limit
        if (isAtLimit && !isEditing) return;
        onSubmit({ platform, accountName, email, username, password, pin, comment });
    };

    if (!isOpen) return null;

    const isEditing = !!initialData?.id;

    return (
        <div className="modal-overlay">
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h2>{isEditing ? "Edit Credential" : "New Credential"}</h2>
                    <button className="modal-close" onClick={onClose}>
                        <FiX size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    {/* Platform picker */}
                    <div className="form-group platform-form-group">
                        <PlatformPicker
                            value={platform}
                            onChange={setPlatform}
                            existingPlatforms={existingPlatforms}
                            disabled={isEditing}
                            platforms={platforms}
                        />
                    </div>

                    <div className="form-group">
                        <div className="input-icon">
                            <FiTag size={18} />
                        </div>
                        <input
                            type="text"
                            placeholder="Account Name (e.g. Work, Personal)"
                            value={accountName}
                            onChange={(e) => setAccountName(e.target.value)}
                            onFocus={handleMobileFocus}
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
                            onFocus={handleMobileFocus}
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
                            onFocus={handleMobileFocus}
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
                            onFocus={handleMobileFocus}
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
                        <div className="input-icon">
                            <FiHash size={18} />
                        </div>
                        <input
                            type={showPin ? "text" : "password"}
                            placeholder="Pin (optional)"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            onFocus={handleMobileFocus}
                        />
                        <button
                            type="button"
                            className="input-suffix"
                            onClick={() => setShowPin(!showPin)}
                        >
                            {showPin ? <FiEyeOff size={16} /> : <FiEye size={16} />}
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
                            onFocus={handleMobileFocus}
                        />
                    </div>

                    {/* Limit gate — shown for new credentials when Free user is at limit */}
                    {isAtLimit && !isEditing ? (
                        <div className="limit-gate">
                            <span className="limit-gate-icon">🔒</span>
                            <strong>Free plan limit reached</strong>
                            <p>You've used all 10 free credential slots.</p>
                            <button
                                type="button"
                                className="modal-submit upgrade-btn"
                                onClick={onUpgrade}
                                id="credential-modal-upgrade-btn"
                            >
                                Upgrade to Pro — Up to 1,000
                            </button>
                        </div>
                    ) : (
                        <button type="submit" className="modal-submit" disabled={loading || !platform.trim()}>
                            {loading ? "Saving..." : isEditing ? "Save Changes" : "Add Credential"}
                        </button>
                    )}
                </form>
            </div>
        </div>
    );
}