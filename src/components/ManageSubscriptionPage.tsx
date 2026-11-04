import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    FREE_CREDENTIAL_LIMIT,
    FREE_STORAGE_LIMIT,
    PRO_CREDENTIAL_LIMIT,
    PRO_STORAGE_LIMIT,
    useSubscription,
} from "../context/SubscriptionContext";
import { openBillingPortal } from "../services/subscriptionService";
import { FiLoader, FiCheck, FiAlertTriangle, FiKey, FiFolder } from "react-icons/fi";

function formatBytes(bytes: number): string {
    if (bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function ManageSubscriptionPage() {
    const {
        isPro,
        subscriptionId,
        isExempt,
        credentialCount,
        credentialLimit,
        storageUsed,
        storageLimit,
        currentPeriodEnd,
        exceedsFreeLimit,
        excessCredentials,
        excessStorage,
    } = useSubscription();
    const navigate = useNavigate();
    const [portalLoading, setPortalLoading] = useState(false);
    const [error, setError] = useState("");

    const handleManage = async () => {
        if (exceedsFreeLimit && !isExempt) {
            setError(
                "Please delete your excess credentials and file storage size to be within the Free tier limit (10 credentials, 500 MB storage) before downgrading. Failure to do so before the billing date may result in a charge."
            );
            return;
        }
        setPortalLoading(true);
        setError("");
        try {
            await openBillingPortal(subscriptionId || "");
        } catch (e: unknown) {
            console.error(e);
            const msg = e instanceof Error ? e.message : "";
            setError(msg || "Failed to open billing portal. Please try again.");
        } finally {
            setPortalLoading(false);
        }
    };

    if (!isPro) {
        return (
            <div style={{ maxWidth: "600px" }}>
                <div className="content-header">
                    <div>
                        <h1 className="page-title">Manage Subscription</h1>
                        <p className="page-subtitle">You are currently on the Free plan (up to 10 credentials and 500 MB storage).</p>
                    </div>
                </div>
            </div>
        );
    }

    const billingDateText = currentPeriodEnd
        ? ` (${currentPeriodEnd.toLocaleDateString()})`
        : "";

    const displayedCredLimit = isExempt ? PRO_CREDENTIAL_LIMIT : FREE_CREDENTIAL_LIMIT;
    const displayedStorageLimit = isExempt ? PRO_STORAGE_LIMIT : FREE_STORAGE_LIMIT;
    const limitLabel = isExempt ? "Pro limit" : "Free limit";
    const isOverCredLimit = isExempt
        ? credentialCount > credentialLimit
        : excessCredentials > 0;
    const isOverStorageLimit = isExempt
        ? storageUsed > storageLimit
        : excessStorage > 0;

    return (
        <div style={{ maxWidth: "600px" }}>
            <div className="content-header">
                <div>
                    <h1 className="page-title">Manage Subscription</h1>
                    <p className="page-subtitle">View and manage your Pro subscription details</p>
                </div>
            </div>

            <div style={{ background: "var(--bg-card)", padding: "24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", marginBottom: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "16px", flexWrap: "wrap" }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Pro Plan Active</h3>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>
                            You have access to all premium features.
                        </p>
                    </div>
                    {currentPeriodEnd && !isExempt && (
                        <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", background: "var(--bg-glass)", padding: "6px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                            Billing Date: <strong>{currentPeriodEnd.toLocaleDateString()}</strong>
                        </div>
                    )}
                </div>

                <ul className="pricing-features" style={{ marginBottom: "20px", padding: "16px", borderRadius: "var(--radius-md)" }}>
                    <li><FiCheck size={14} /> Up to 1,000 credentials</li>
                    <li><FiCheck size={14} /> Full password history</li>
                    <li><FiCheck size={14} /> 5GB storage</li>
                    <li><FiCheck size={14} /> No upload limit</li>
                    <li><FiCheck size={14} /> File Sharing</li>
                    <li><FiCheck size={14} /> No ads</li>
                    <li><FiCheck size={14} /> End-to-end encryption</li>
                    <li><FiCheck size={14} /> 30-day free trial</li>
                </ul>

                {/* Current Usage vs Plan/Free Limits */}
                <div style={{ background: "var(--bg-glass)", padding: "16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", marginBottom: "20px" }}>
                    <h4 style={{ margin: "0 0 12px", fontSize: "0.9rem" }}>
                        {isExempt ? "Current Usage (Pro Tier Limits)" : "Usage vs. Free Tier Limits"}
                    </h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.85rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Credentials Saved:</span>
                            <strong style={{ color: isOverCredLimit ? "var(--danger)" : "var(--text-primary)" }}>
                                {credentialCount} / {displayedCredLimit.toLocaleString()} {limitLabel}
                                {!isExempt && excessCredentials > 0 ? ` (${excessCredentials} over limit)` : ""}
                            </strong>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ color: "var(--text-secondary)" }}>File Storage Used:</span>
                            <strong style={{ color: isOverStorageLimit ? "var(--danger)" : "var(--text-primary)" }}>
                                {formatBytes(storageUsed)} / {formatBytes(displayedStorageLimit)} {limitLabel}
                                {!isExempt && excessStorage > 0 ? ` (${formatBytes(excessStorage)} over limit)` : ""}
                            </strong>
                        </div>
                    </div>
                </div>

                {exceedsFreeLimit && !isExempt ? (
                    <div
                        style={{
                            background: "rgba(239, 68, 68, 0.1)",
                            border: "1px solid var(--danger)",
                            borderRadius: "var(--radius-md)",
                            padding: "16px",
                            marginBottom: "20px",
                            color: "var(--text-primary)",
                        }}
                    >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "10px" }}>
                            <FiAlertTriangle size={18} style={{ color: "var(--danger)", flexShrink: 0, marginTop: "2px" }} />
                            <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
                                <strong style={{ color: "var(--danger)", display: "block", marginBottom: "4px" }}>
                                    Downgrade Locked — Usage Exceeds Free Tier Limits
                                </strong>
                                You must delete your excess credentials and file storage size to be within the Free tier limit ({FREE_CREDENTIAL_LIMIT} credentials, 500 MB file storage) before downgrading back to the Free tier:
                                <ul style={{ margin: "8px 0", paddingLeft: "18px" }}>
                                    {excessCredentials > 0 && (
                                        <li>
                                            Delete at least <strong>{excessCredentials}</strong> {excessCredentials === 1 ? "credential" : "credentials"} (currently {credentialCount}/{FREE_CREDENTIAL_LIMIT}).
                                        </li>
                                    )}
                                    {excessStorage > 0 && (
                                        <li>
                                            Delete at least <strong>{formatBytes(excessStorage)}</strong> of files (currently {formatBytes(storageUsed)}/500 MB).
                                        </li>
                                    )}
                                </ul>
                                <strong style={{ color: "var(--danger)" }}>
                                    Failure to do so before the billing date{billingDateText} may result in a charge.
                                </strong>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "12px" }}>
                            {excessCredentials > 0 && (
                                <button
                                    type="button"
                                    className="admin-btn-secondary"
                                    onClick={() => navigate("/")}
                                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem" }}
                                >
                                    <FiKey size={14} /> Manage Credentials
                                </button>
                            )}
                            {excessStorage > 0 && (
                                <button
                                    type="button"
                                    className="admin-btn-secondary"
                                    onClick={() => navigate("/files")}
                                    style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "0.8rem" }}
                                >
                                    <FiFolder size={14} /> Manage Files
                                </button>
                            )}
                        </div>
                    </div>
                ) : !isExempt ? (
                    <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginBottom: "16px", lineHeight: 1.5 }}>
                        You are within the Free tier limits and eligible to downgrade. Please note that you must stay within the Free tier limit ({FREE_CREDENTIAL_LIMIT} credentials and 500 MB storage) to downgrade, and <strong>failure to downgrade before the billing date{billingDateText} may result in a charge.</strong>
                    </p>
                ) : null}

                {error && <div className="auth-error" style={{ marginBottom: "16px" }}>{error}</div>}

                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    {isExempt
                        ? "Your account is manually exempted by an administrator and has the same limits as the Pro tier (up to 1,000 credentials and 5 GB storage)."
                        : "Click below to open the billing portal where you can update your payment method, view invoices, or cancel/downgrade your subscription."}
                </p>

                <button
                    className="auth-submit"
                    onClick={handleManage}
                    disabled={portalLoading || isExempt || exceedsFreeLimit}
                    title={
                        exceedsFreeLimit && !isExempt
                            ? "Delete excess credentials and files to be within the Free tier limit before downgrading"
                            : undefined
                    }
                    style={{
                        maxWidth: "280px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        gap: "8px",
                        opacity: portalLoading || isExempt || exceedsFreeLimit ? 0.6 : 1,
                        cursor: portalLoading || isExempt || exceedsFreeLimit ? "not-allowed" : "pointer",
                    }}
                >
                    {portalLoading ? (
                        <><FiLoader size={16} className="spin" /> Opening Portal...</>
                    ) : isExempt ? (
                        "Managed by Admin"
                    ) : exceedsFreeLimit ? (
                        "Delete Excess Data to Downgrade"
                    ) : (
                        "Open Billing Portal"
                    )}
                </button>
            </div>
        </div>
    );
}