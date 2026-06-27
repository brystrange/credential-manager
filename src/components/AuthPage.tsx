import { useState } from "react";
import { useLoginThrottle } from "../hooks/useLoginThrottle";
import { signIn, signUp, signInWithGoogle, unlockVaultWithPassword, resendVerificationEmail, resetPassword } from "../services/authService";
import {
    FiMail,
    FiLock,
    FiLogIn,
    FiUserPlus,
    FiUser,
    FiCheckCircle,
    FiAlertCircle,
    FiRefreshCw,
    FiEye,
    FiEyeOff,
} from "react-icons/fi";
import { FcGoogle } from "react-icons/fc";

interface AuthPageProps {
    onAuthSuccess: () => void;
    onAuthStart?: () => void;
    onAuthEnd?: () => void;
    onNewGoogleUser?: () => void;
}

type AuthView = "login" | "signup" | "vault-unlock" | "verify-email";

/** Maps a raw Firebase error message to a user-friendly string. */
function friendlyError(msg: string): string {
    if (msg.includes("auth/email-already-in-use"))
        return "This email is already registered. Try signing in instead.";
    if (msg.includes("auth/user-not-found"))
        return "Account does not exist.";
    if (msg.includes("auth/invalid-credential") || msg.includes("auth/wrong-password"))
        return "Incorrect email or password.";
    if (msg.includes("auth/weak-password"))
        return "Password must be at least 6 characters.";
    if (msg.includes("auth/invalid-email"))
        return "Please enter a valid email address.";
    if (msg.includes("auth/email-not-verified"))
        return "__email_not_verified__";
    if (msg.includes("auth/popup-closed-by-user") || msg.includes("auth/cancelled-popup-request"))
        return "Sign-in popup was closed. Please try again.";
    if (msg.includes("auth/popup-blocked"))
        return "Popup was blocked by your browser. Please allow popups for this site and try again.";
    if (msg.includes("auth/too-many-requests"))
        return "Too many failed attempts. Please wait a few minutes before trying again.";
    if (msg.includes("auth/network-request-failed"))
        return "Network error. Please check your connection and try again.";
    if (msg.includes("auth/user-disabled"))
        return "This account has been disabled. Please contact support.";
    if (msg.includes("auth/requires-recent-login"))
        return "Please sign out and sign back in, then try again.";
    if (msg.includes("No Fort Knox account"))
        return "No account found for this Google account. Please sign up with email first.";
    // Strip raw Firebase prefix for any remaining codes
    return msg.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[^)]+\)\.?$/, "");
}

export default function AuthPage({ onAuthSuccess, onAuthStart, onAuthEnd, onNewGoogleUser }: AuthPageProps) {
    const {
        isLockedOut,
        remainingSeconds,
        attemptsRemaining,
        resetEmailSent,
        resetEmailMessage,
        recordFailure,
        recordSuccess,
    } = useLoginThrottle();
    const [view, setView] = useState<AuthView>("login");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [fullName, setFullName] = useState("");
    const [vaultPassword, setVaultPassword] = useState("");
    const [showVaultPassword, setShowVaultPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [resendLoading, setResendLoading] = useState(false);
    const [resendSuccess, setResendSuccess] = useState(false);
    const [pendingEmail, setPendingEmail] = useState("");
    const [pendingPassword, setPendingPassword] = useState("");
    const [resetPasswordSuccess, setResetPasswordSuccess] = useState("");

    const resetFields = () => {
        setEmail("");
        setPassword("");
        setShowPassword(false);
        setConfirmPassword("");
        setShowConfirmPassword(false);
        setFullName("");
        setVaultPassword("");
        setShowVaultPassword(false);
        setError("");
        setResendSuccess(false);
        setResetPasswordSuccess("");
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
                onAuthStart?.();
                await signIn(email, password);
                recordSuccess();
                onAuthSuccess();
            } else if (view === "signup") {
                await signUp(email, password, fullName.trim());
                setPendingEmail(email);
                setPendingPassword(password);
                setView("verify-email");
            } else if (view === "vault-unlock") {
                onAuthStart?.();
                await unlockVaultWithPassword(vaultPassword);
                onAuthSuccess();
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
            const friendly = friendlyError(msg);
            setError(friendly);
            if (view === "login" && friendly !== "__email_not_verified__") {
                recordFailure(email);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError("");
        setGoogleLoading(true);
        // Guard against VaultUnlockGate / dashboard flashing while Firebase
        // auth state changes during the popup flow.
        onAuthStart?.();
        try {
            const result = await signInWithGoogle();
            recordSuccess();
            if (result.status === "new") {
                // Hand off to App.tsx to show the vault-setup screen
                onNewGoogleUser?.();
            }
            // For existing users, App.tsx VaultUnlockGate takes over naturally.
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Google sign-in failed. Please try again.";
            setError(friendlyError(msg));
        } finally {
            onAuthEnd?.();
            setGoogleLoading(false);
        }
    };

    const handleResendVerification = async () => {
        setResendLoading(true);
        setResendSuccess(false);
        setError("");
        try {
            const emailToUse = pendingEmail || email;
            const passwordToUse = pendingPassword || password;
            await resendVerificationEmail(emailToUse, passwordToUse);
            setResendSuccess(true);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to resend email.";
            setError(friendlyError(msg));
        } finally {
            setResendLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setError("Please enter your email address first.");
            return;
        }
        setLoading(true);
        setError("");
        setResetPasswordSuccess("");
        try {
            await resetPassword(email);
            setResetPasswordSuccess("Password reset email sent. Check your inbox.");
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to send reset email.";
            setError(friendlyError(msg));
        } finally {
            setLoading(false);
        }
    };

    // ── Verify-email confirmation screen ─────────────────────────────────────
    if (view === "verify-email") {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <div className="auth-logo" style={{ color: "var(--accent)" }}>
                            <FiMail size={32} />
                        </div>
                        <h1>Check your email</h1>
                        <p className="auth-subtitle">
                            We sent a verification link to <strong>{pendingEmail}</strong>
                        </p>
                    </div>

                    <div className="verify-steps">
                        <div className="verify-step">
                            <FiCheckCircle size={16} className="verify-step-icon" />
                            <span>Open the email from Fort Knox</span>
                        </div>
                        <div className="verify-step">
                            <FiCheckCircle size={16} className="verify-step-icon" />
                            <span>Click the verification link</span>
                        </div>
                        <div className="verify-step">
                            <FiCheckCircle size={16} className="verify-step-icon" />
                            <span>Return here and sign in</span>
                        </div>
                    </div>

                    {error && <div className="auth-error">{error}</div>}
                    {resendSuccess && (
                        <div className="auth-success">
                            <FiCheckCircle size={14} />
                            Verification email resent successfully.
                        </div>
                    )}

                    <button
                        className="auth-submit"
                        onClick={handleResendVerification}
                        disabled={resendLoading}
                        style={{ marginTop: "8px" }}
                    >
                        {resendLoading ? "Sending..." : (
                            <>
                                <FiRefreshCw size={14} style={{ marginRight: 6 }} />
                                Resend verification email
                            </>
                        )}
                    </button>

                    <button
                        className="google-btn"
                        style={{ marginTop: 12 }}
                        onClick={() => { resetFields(); setView("login"); }}
                    >
                        <FiLogIn size={16} />
                        Go to Sign In
                    </button>
                </div>
            </div>
        );
    }

    // ── Vault unlock screen (post Google sign-in) ─────────────────────────────
    if (view === "vault-unlock") {
        return (
            <div className="auth-container">
                <div className="auth-card">
                    <div className="auth-header">
                        <div className="auth-logo">
                            <img src="/logo.svg" alt="Logo" style={{ width: 32, height: 32 }} />
                        </div>
                        <h1>Fort Knox</h1>
                        <p className="auth-subtitle">Secure credential management</p>
                    </div>

                    <div className="vault-unlock-info">
                        <FiLock size={20} />
                        <div>
                            <strong>Unlock Your Vault</strong>
                            <p>Enter your password to decrypt your credentials.</p>
                        </div>
                    </div>

                    {error && <div className="auth-error">{error}</div>}

                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <div className="input-icon">
                                <FiLock size={16} />
                            </div>
                            <input
                                type={showVaultPassword ? "text" : "password"}
                                placeholder="Your password"
                                value={vaultPassword}
                                onChange={(e) => setVaultPassword(e.target.value)}
                                required
                                autoFocus
                                autoComplete="current-password"
                            />
                            <button
                                type="button"
                                className="input-suffix"
                                onClick={() => setShowVaultPassword(!showVaultPassword)}
                            >
                                {showVaultPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                            </button>
                        </div>
                        <button type="submit" className="auth-submit" disabled={loading}>
                            {loading ? "Unlocking..." : "Unlock Vault"}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // ── Login / Sign-up screens ───────────────────────────────────────────────
    const isEmailNotVerified = error === "__email_not_verified__";

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <div className="auth-logo">
                        <img src="/logo.svg" alt="Logo" style={{ width: 40, height: 40 }} />
                    </div>
                    <h1>Fort Knox</h1>
                    <p className="auth-subtitle">Secure credential management</p>
                </div>

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

                {/* Email-not-verified gets a special banner with resend button */}
                {isEmailNotVerified ? (
                    <div className="auth-verify-banner">
                        <FiAlertCircle size={16} className="banner-icon" />
                        <div className="banner-body">
                            <strong>Email not verified</strong>
                            <p>
                                Please check your inbox and click the verification link before signing in.
                            </p>
                            {resendSuccess ? (
                                <span className="banner-resent">
                                    <FiCheckCircle size={13} /> Email resent!
                                </span>
                            ) : (
                                <button
                                    className="banner-resend-btn"
                                    onClick={handleResendVerification}
                                    disabled={resendLoading}
                                >
                                    {resendLoading ? "Sending..." : (
                                        <><FiRefreshCw size={12} /> Resend verification email</>
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    error && <div className="auth-error">{error}</div>
                )}
                
                {resetPasswordSuccess && (
                    <div className="auth-success" style={{ marginBottom: "16px" }}>
                        <FiCheckCircle size={16} />
                        {resetPasswordSuccess}
                    </div>
                )}

                {/* Rate limiting UI */}
                {view === "login" && resetEmailMessage && (
                    <div className="auth-error" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
                        {resetEmailMessage}
                    </div>
                )}
                {view === "login" && isLockedOut && !resetEmailSent && (
                    <div className="auth-error" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, padding: "12px 14px", marginBottom: 8, color: "var(--text-muted)" }}>
                        ⚠️ Too many failed attempts. Try again in <strong>{Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, "0")}</strong>
                    </div>
                )}
                {view === "login" && !isLockedOut && attemptsRemaining < 5 && attemptsRemaining > 0 && error && (
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", textAlign: "center", margin: "0 0 8px" }}>
                        {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining before lockout
                    </div>
                )}

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
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            autoComplete={view === "login" ? "current-password" : "new-password"}
                        />
                        <button
                            type="button"
                            className="input-suffix"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                        </button>
                    </div>

                    {view === "login" && (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "-8px", marginBottom: "12px" }}>
                            <button
                                type="button"
                                onClick={handleForgotPassword}
                                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "0.85rem", cursor: "pointer", padding: 0 }}
                                disabled={loading}
                            >
                                Forgot password?
                            </button>
                        </div>
                    )}

                    {view === "signup" && (
                        <div className="form-group">
                            <div className="input-icon">
                                <FiLock size={16} />
                            </div>
                            <input
                                type={showConfirmPassword ? "text" : "password"}
                                placeholder="Confirm password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                                autoComplete="new-password"
                            />
                            <button
                                type="button"
                                className="input-suffix"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                                {showConfirmPassword ? <FiEyeOff size={16} /> : <FiEye size={16} />}
                            </button>
                        </div>
                    )}

                    <button type="submit" className="auth-submit" disabled={loading || (view === "login" && (isLockedOut || resetEmailSent))}>
                        {loading
                            ? view === "login" ? "Signing In..." : "Creating Account..."
                            : view === "login" ? "Sign In" : "Create Account"}
                    </button>
                </form>

                {view === "login" && (
                    <>
                        <div className="auth-divider">
                            <span>or</span>
                        </div>

                        <button
                            className="google-btn"
                            onClick={handleGoogleSignIn}
                            disabled={googleLoading}
                        >
                            {googleLoading ? "Signing In..." : (
                                <>
                                    <FcGoogle size={18} />
                                    Sign in with Google
                                </>
                            )}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}