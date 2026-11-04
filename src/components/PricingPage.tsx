import { useState } from "react";
import {
  FREE_CREDENTIAL_LIMIT,
  useSubscription,
} from "../context/SubscriptionContext";
import { createCheckout, openBillingPortal } from "../services/subscriptionService";
import { FiCheck, FiLoader, FiAlertTriangle } from "react-icons/fi";

interface PricingPageProps {
  onClose: () => void;
}

const PRO_MONTHLY_VARIANT_ID = import.meta.env.VITE_LS_PRO_MONTHLY_VARIANT_ID ?? "";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

export default function PricingPage({ onClose }: PricingPageProps) {
  const {
    isPro,
    subscriptionId,
    isExempt,
    exceedsFreeLimit,
    excessCredentials,
    excessStorage,
    currentPeriodEnd,
  } = useSubscription();
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

  const billingDateText = currentPeriodEnd
    ? ` (${currentPeriodEnd.toLocaleDateString()})`
    : "";

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

        {isPro && !isExempt && exceedsFreeLimit && (
          <div
            style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--danger)",
              borderRadius: "var(--radius-md)",
              padding: "12px 16px",
              marginBottom: "16px",
              fontSize: "0.82rem",
              lineHeight: 1.5,
              color: "var(--text-primary)",
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              textAlign: "left",
            }}
          >
            <FiAlertTriangle size={18} style={{ color: "var(--danger)", flexShrink: 0, marginTop: "2px" }} />
            <div>
              <strong style={{ color: "var(--danger)" }}>Cannot downgrade to Free tier yet: </strong>
              Please delete your excess{" "}
              {excessCredentials > 0 && (
                <>
                  <strong>{excessCredentials}</strong> {excessCredentials === 1 ? "credential" : "credentials"} (Free max: {FREE_CREDENTIAL_LIMIT})
                </>
              )}
              {excessCredentials > 0 && excessStorage > 0 && " and "}
              {excessStorage > 0 && (
                <>
                  <strong>{formatBytes(excessStorage)}</strong> of file storage (Free max: 500 MB)
                </>
              )}{" "}
              before downgrading.{" "}
              <strong style={{ color: "var(--danger)" }}>
                Failure to do so before the billing date{billingDateText} may result in a charge.
              </strong>
            </div>
          </div>
        )}

        {error && <div className="auth-error" style={{ margin: "0 0 16px" }}>{error}</div>}

        {/* Cards */}
        <div className="pricing-cards">
          {/* Free Card */}
          <div className={`pricing-card${!isPro ? " current" : ""}`}>
            {!isPro && (
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
              <li><FiCheck size={14} /> Last 3 password history</li>
              <li><FiCheck size={14} /> 500MB storage</li>
              <li><FiCheck size={14} /> 20MB upload limit</li>
              <li><FiCheck size={14} /> No ads</li>
              <li><FiCheck size={14} /> End-to-end encryption</li>
            </ul>
            <div className="pricing-card-footer">
              {!isPro ? (
                <button className="pricing-btn secondary" disabled>
                  Current Plan
                </button>
              ) : (
                <button
                  className="pricing-btn secondary"
                  onClick={handleManage}
                  disabled={portalLoading || isExempt || exceedsFreeLimit}
                  title={
                    exceedsFreeLimit
                      ? "Delete excess credentials and file storage size to be within the Free tier limit before downgrading"
                      : "Downgrade to Free tier"
                  }
                >
                  {portalLoading ? (
                    <><FiLoader size={14} className="spin" /> Opening…</>
                  ) : exceedsFreeLimit ? (
                    "Delete Excess Data to Downgrade"
                  ) : (
                    "Downgrade"
                  )}
                </button>
              )}
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
                <span className="price-amount">$1.50</span>
                <span className="price-period">/month</span>
              </div>
            </div>
            <ul className="pricing-features">
              <li><FiCheck size={14} /> Up to 1,000 credentials</li>
              <li><FiCheck size={14} /> Full password history</li>
              <li><FiCheck size={14} /> 5GB storage</li>
              <li><FiCheck size={14} /> No upload limit</li>
              <li><FiCheck size={14} /> File Sharing</li>
              <li><FiCheck size={14} /> No ads</li>
              <li><FiCheck size={14} /> End-to-end encryption</li>
              <li><FiCheck size={14} /> 30-day free trial</li>
            </ul>
            <div className="pricing-card-footer">
              {isPro ? (
                <button
                  className="pricing-btn secondary"
                  onClick={handleManage}
                  disabled={portalLoading || isExempt || exceedsFreeLimit}
                  id="manage-subscription-btn"
                >
                  {portalLoading ? (
                    <><FiLoader size={14} className="spin" /> Opening…</>
                  ) : exceedsFreeLimit ? (
                    <>Delete Excess Data to Downgrade</>
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