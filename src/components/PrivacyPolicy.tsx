import { useEffect } from "react";
import MarketingLayout from "./MarketingLayout";

export default function PrivacyPolicy() {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <MarketingLayout>
            <div style={{ padding: "48px 24px", color: "var(--text-primary)" }}>
                <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                
                <h1 style={{ fontSize: "2.5rem", marginBottom: "16px" }}>Privacy Policy</h1>
                <p style={{ color: "var(--text-secondary)", marginBottom: "48px" }}>Last updated: {new Date().toLocaleDateString()}</p>

                <div className="legal-content" style={{ lineHeight: "1.7", fontSize: "1.05rem" }}>
                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>1. Zero-Knowledge Architecture</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        Fort Sterling is designed with a zero-knowledge architecture. This means your vault data (passwords, credentials, and notes) is encrypted on your local device before it is transmitted to our servers. We do not have the keys to decrypt your vault data, and we cannot read it.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>2. Information We Collect</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        While we cannot read your vault data, we do collect some basic information to provide the Service:
                        <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                            <li><strong>Account Information:</strong> Your email address, which is used for authentication and account recovery (login password only, not vault password).</li>
                            <li><strong>Encrypted Data:</strong> The encrypted blobs of your vault data, securely stored on our servers.</li>
                            <li><strong>Billing Information:</strong> If you subscribe to our Pro plan, billing information is handled securely by our Merchant of Record, Lemon Squeezy. We do not store your full credit card details.</li>
                            <li><strong>Usage Data:</strong> Aggregated, anonymized metadata (like the number of credentials you store) to enforce plan limits and improve the Service.</li>
                        </ul>
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>3. How We Use Your Information</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        We use the information we collect solely to operate, maintain, and improve the Service. Your email address is used for important account notifications. We do not sell your personal data to third parties.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>4. Data Security</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        We employ industry-standard security measures to protect the information we store. Your vault data is encrypted using AES-GCM encryption. However, no method of transmission over the Internet or electronic storage is 100% secure.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>5. Data Retention</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        We retain your encrypted data as long as your account is active. If you delete your account, your encrypted data will be permanently removed from our active systems.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>6. Changes to This Policy</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page.
                    </p>
                </div>
                </div>
            </div>
        </MarketingLayout>
    );
}
