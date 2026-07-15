import { useState } from "react";
import { useSubscription } from "../context/SubscriptionContext";
import { openBillingPortal } from "../services/subscriptionService";
import { FiLoader, FiCheck } from "react-icons/fi";

export default function ManageSubscriptionPage() {
    const { isPro, subscriptionId, lsCustomerId } = useSubscription();
    const [portalLoading, setPortalLoading] = useState(false);
    const [error, setError] = useState("");

    const handleManage = async () => {
        setPortalLoading(true);
        setError("");
        try {
            await openBillingPortal(subscriptionId);
        } catch (e) {
            console.error(e);
            setError("Failed to open billing portal. Please try again.");
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
                        <p className="page-subtitle">You are not currently subscribed to the Pro plan.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ maxWidth: "600px" }}>
            <div className="content-header">
                <div>
                    <h1 className="page-title">Manage Subscription</h1>
                    <p className="page-subtitle">View and manage your Pro subscription details</p>
                </div>
            </div>

            <div style={{ background: "var(--bg-card)", padding: "24px", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", marginBottom: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
                    <div>
                        <h3 style={{ margin: 0 }}>Pro Plan Active</h3>
                        <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", margin: 0 }}>
                            You have access to all premium features.
                        </p>
                    </div>
                </div>

                <ul className="pricing-features" style={{ marginBottom: "24px", background: "var(--bg-glass)", padding: "16px", borderRadius: "var(--radius-md)" }}>
                    <li><FiCheck size={14} /> Up to 1,000 credentials</li>
                    <li><FiCheck size={14} /> Full password history</li>
                    <li><FiCheck size={14} /> All platforms</li>
                    <li><FiCheck size={14} /> End-to-end encryption</li>
                    <li><FiCheck size={14} /> No ads</li>
                </ul>

                {error && <div className="auth-error" style={{ marginBottom: "16px" }}>{error}</div>}

                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    Click below to open the billing portal where you can update your payment method, view invoices, or cancel your subscription.
                </p>

                <button 
                    className="auth-submit" 
                    onClick={handleManage} 
                    disabled={portalLoading}
                    style={{ maxWidth: "250px", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px" }}
                >
                    {portalLoading ? (
                        <><FiLoader size={16} className="spin" /> Opening Portal...</>
                    ) : (
                        "Open Billing Portal"
                    )}
                </button>
            </div>
        </div>
    );
}
