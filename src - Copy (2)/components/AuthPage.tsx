import { useState } from "react";
import { signIn, signUp, signInWithGoogle, unlockVaultWithPassword } from "../services/authService";
import {
    FiShield,
    FiMail,
    FiLock,
    FiLogIn,
    FiUserPlus,
    FiUser,
} from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";

interface AuthPageProps {
    onAuthSuccess: () => void;
}

type AuthView = "login" | "signup" | "vault-unlock";

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
    const [view, setView] = useState<AuthView>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [vaultPassword, setVaultPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    const resetFields = () => {
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setFullName("");
        setVaultPassword("");
        setError("");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (view === "signup") {
            if (password !== confirmPassword) {
                setError("Passwords do not match.");
                return;
            }
            if (fullName.trim().length < 2) {
                setError("Please enter your full name.");
                return;
            }
        }

        setLoading(true);
        try {
            if (view === "login") {
                await signIn(email, password);
                onAuthSuccess();
            } else if (view === "signup") {
                await signUp(email, password, fullName.trim());
                onAuthSuccess();
            } else if (view === "vault-unlock") {
                await unlockVaultWithPassword(vaultPassword);
                onAuthSuccess();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Authentication failed";
            if (msg.includes("auth/email-already-in-use"))
                setError("This email is already registered.");
            else if (msg.includes("auth/invalid-credential"))
                setError("Invalid email or password.");
            else if (msg.includes("auth/weak-password"))
                setError("Password must be at least 6 characters.");
            else if (msg.includes("auth/invalid-email"))
                setError("Please enter a valid email address.");
            else setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError("");
        setGoogleLoading(true);
        try {
            const result = await signInWithGoogle();
            if (result.needsPassword) {
                setView("vault-unlock");
            } else {
                onAuthSuccess();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Google sign-in failed";
            setError(msg);
        } finally {
            setGoogleLoading(false);
        }
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">
                        <FiShield size={32} />
                    </div>
                    <h1>Fort Knox</h1>
                    <p className="auth-subtitle">Secure credential management</p>
                </div>

                {view === "vault-unlock" ? (
                    <>
                        <div className="vault-unlock-info">
                            <FiLock size={20} />
                            <div>
                                <strong>Unlock Your Vault</strong>
                                <p>Enter your vault password to decrypt your credentials.</p>
                            </div>
                        </div>

                        {error && <div className="auth-error">{error}</div>}

                        <form onSubmit={handleSubmit} className="auth-form">
                            <div className="form-group">
                                <div className="input-icon">
                                    <FiLock size={16} />
                                </div>
                                <input
                                    type="password"
                                    placeholder="Vault password"
                                    value={vaultPassword}
                                    onChange={(e) => setVaultPassword(e.target.value)}
                                    required
                                    autoFocus
                                    autoComplete="current-password"
                                />
                            </div>
                            <button type="submit" className="auth-submit" disabled={loading}>
                                {loading ? <span className="spinner" /> : "Unlock Vault"}
                            </button>
                        </form>
                    </>
                ) : (
                    <>
                        <div className="auth-toggle">
                            <button
                                className={`auth-toggle-btn ${view === "login" ? "active" : ""}`}
                                onClick={() => { setView("login"); resetFields(); }}
                            >
                                <FiLogIn size={14} />
                                Sign In
                            </button>
                            <button
                                className={`auth-toggle-btn ${view === "signup" ? "active" : ""}`}
                                onClick={() => { setView("signup"); resetFields(); }}
                            >
                                <FiUserPlus size={14} />
                                Sign Up
                            </button>
                        </div>

                        {error && <div className="auth-error">{error}</div>}

                        <form onSubmit={handleSubmit} className="auth-form">
                            {view === "signup" && (
                                <div className="form-group">
                                    <div className="input-icon">
                                        <FiUser size={16} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Full name"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        required
                                        autoComplete="name"
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <div className="input-icon">
                                    <FiMail size={16} />
                                </div>
                                <input
                                    type="email"
                                    placeholder="Email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoComplete="email"
                                />
                            </div>

                            <div className="form-group">
                                <div className="input-icon">
                                    <FiLock size={16} />
                                </div>
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    autoComplete={view === "login" ? "current-password" : "new-password"}
                                />
                            </div>

                            {view === "signup" && (
                                <div className="form-group">
                                    <div className="input-icon">
                                        <FiLock size={16} />
                                    </div>
                                    <input
                                        type="password"
                                        placeholder="Confirm password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                            )}

                            <button type="submit" className="auth-submit" disabled={loading}>
                                {loading ? (
                                    <span className="spinner" />
                                ) : view === "login" ? (
                                    "Sign In"
                                ) : (
                                    "Create Account"
                                )}
                            </button>
                        </form>

                        <div className="auth-divider">
                            <span>or</span>
                        </div>

                        <button
                            className="google-btn"
                            onClick={handleGoogleSignIn}
                            disabled={googleLoading}
                        >
                            {googleLoading ? (
                                <span className="spinner" />
                            ) : (
                                <>
                                    <FcGoogle size={18} />
                                    Sign in with Google
                                </>
                            )}
                        </button>

                        {view === "login" && (
                            <p className="auth-footnote">
                                Google sign-in is for existing accounts only.
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
