import { useState } from "react";
import { useSubscription } from "../context/SubscriptionContext";
import { createCheckout, openBillingPortal } from "../services/subscriptionService";
import { FiCheck, FiLoader } from "react-icons/fi";

interface PricingPageProps {
  onClose: () => void;
}

const PRO_MONTHLY_VARIANT_ID = import.meta.env.VITE_LS_PRO_MONTHLY_VARIANT_ID ?? "";

export default function PricingPage({ onClose }: PricingPageProps) {
  const { plan, isPro, subscriptionId } = useSubscription();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [error, setError] = useState("");

  const handleUpgrade = async () => {
    if (!PRO_MONTHLY_VARIANT_ID) {
      setError("Upgrade is not configured yet. Please contact support.");
      return;
    }
    setCheckoutLoading(true);
    setError("");
    try {
      await createCheckout(PRO_MONTHLY_VARIANT_ID);
    } catch (e) {
      console.error(e);
      setError("Failed to open checkout. Please try again.");
      setCheckoutLoading(false);
    }
  };

  const handleManage = async () => {
    if (!subscriptionId) return;
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="pricing-page"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Pricing plans"
      >
        {/* Header */}
        <div className="pricing-header">
          <div className="pricing-badge">
            <span>Plans &amp; Pricing</span>
          </div>
          <h2 className="pricing-title">Simple, transparent pricing</h2>
          <p className="pricing-subtitle">
            Start free, upgrade when you need more.
          </p>
        </div>

        {error && <div className="auth-error" style={{ margin: "0 0 16px" }}>{error}</div>}

        {/* Cards */}
        <div className="pricing-cards">
          {/* Free Card */}
          <div className={`pricing-card${plan === "free" ? " current" : ""}`}>
            {plan === "free" && (
              <div className="pricing-card-badge current-badge">Current Plan</div>
            )}
            <div className="pricing-card-header">
              <h3>Free</h3>
              <div className="pricing-price">
                <span className="price-amount">$0</span>
                <span className="price-period">/month</span>
              </div>
            </div>
            <ul className="pricing-features">
              <li><FiCheck size={14} /> Up to 10 credentials</li>
              <li><FiCheck size={14} /> Last 3 password revisions</li>
              <li><FiCheck size={14} /> All platforms</li>
              <li><FiCheck size={14} /> End-to-end encryption</li>
            </ul>
            <div className="pricing-card-footer">
              <button className="pricing-btn secondary" disabled>
                {plan === "free" ? "Current Plan" : "Downgrade"}
              </button>
            </div>
          </div>

          {/* Pro Card */}
          <div className={`pricing-card pro${isPro ? " current" : ""}`}>
            <div className="pricing-card-badge pro-badge">
              Most Popular
            </div>
            {isPro && (
              <div className="pricing-card-badge current-badge" style={{ top: 40 }}>Active</div>
            )}
            <div className="pricing-card-header">
              <h3>Pro</h3>
              <div className="pricing-price">
                <span className="price-amount">$3.99</span>
                <span className="price-period">/month</span>
              </div>
            </div>
            <ul className="pricing-features">
              <li><FiCheck size={14} /> Up to 1,000 credentials</li>
              <li><FiCheck size={14} /> Full password history</li>
              <li><FiCheck size={14} /> All platforms</li>
              <li><FiCheck size={14} /> End-to-end encryption</li>
              <li><FiCheck size={14} /> Priority support</li>
            </ul>
            <div className="pricing-card-footer">
              {isPro ? (
                <button
                  className="pricing-btn secondary"
                  onClick={handleManage}
                  disabled={portalLoading || !subscriptionId}
                  id="manage-subscription-btn"
                >
                  {portalLoading ? (
                    <><FiLoader size={14} className="spin" /> Opening…</>
                  ) : (
                    <>Manage Subscription</>
                  )}
                </button>
              ) : (
                <button
                  className="pricing-btn primary"
                  onClick={handleUpgrade}
                  disabled={checkoutLoading}
                  id="upgrade-to-pro-btn"
                >
                  {checkoutLoading ? (
                    <><FiLoader size={14} className="spin" /> Redirecting…</>
                  ) : (
                    <>Upgrade to Pro</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        <button
          className="pricing-close"
          onClick={onClose}
          id="pricing-close-btn"
          aria-label="Close pricing"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
