import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";

export default function TermsOfService() {
    const navigate = useNavigate();

    return (
        <div style={{ minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)", padding: "48px 24px" }}>
            <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                <button 
                    onClick={() => navigate("/")}
                    style={{ background: "none", border: "none", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginBottom: "32px", fontSize: "1rem" }}
                >
                    <FiArrowLeft /> Back to Home
                </button>
                
                <h1 style={{ fontSize: "2.5rem", marginBottom: "16px" }}>Terms of Service</h1>
                <p style={{ color: "var(--text-secondary)", marginBottom: "48px" }}>Last updated: {new Date().toLocaleDateString()}</p>

                <div className="legal-content" style={{ lineHeight: "1.7", fontSize: "1.05rem" }}>
                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>1. Acceptance of Terms</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        By accessing or using Fort Sterling (the "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>2. Description of Service</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        Fort Sterling is a zero-knowledge credential manager. We provide tools for you to securely encrypt and store your credentials. Because of our zero-knowledge architecture, we do not possess the keys to decrypt your data and cannot recover your data if you lose your Recovery Key and password.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>3. Account Security</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        You are solely responsible for maintaining the confidentiality of your vault password and your Recovery Key. You are responsible for all activities that occur under your account. Fort Sterling is not liable for any loss or damage arising from your failure to protect your login credentials.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>4. Subscriptions and Payments</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        Fort Sterling offers premium features through a paid subscription (the "Pro" plan). Payments are processed securely via our Merchant of Record, Lemon Squeezy. By subscribing, you agree to their terms of payment. Subscriptions auto-renew until cancelled. You may cancel at any time.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>5. Acceptable Use</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        You agree not to use the Service for any unlawful or prohibited activities. You may not attempt to gain unauthorized access to the Service or its related systems or networks.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>6. Limitation of Liability</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        To the maximum extent permitted by law, Fort Sterling shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or use, arising out of or related to your use of the Service.
                    </p>
                </div>
            </div>
        </div>
    );
}
