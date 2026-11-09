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
                        While we cannot read your vault data, we do collect basic information necessary to provide the Service:
                        <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                            <li><strong>Account Information:</strong> Your email address and display name, used for authentication and account recovery (login password only, not vault password).</li>
                            <li><strong>Encrypted Data:</strong> The encrypted blobs of your vault credentials and files, securely stored on our servers.</li>
                            <li><strong>Billing Information:</strong> If you subscribe to our Pro plan, payment processing is handled securely by our Merchant of Record, Lemon Squeezy. We do not store or process your full payment card details.</li>
                            <li><strong>Usage Data:</strong> Aggregated, anonymized metadata (like the number of credentials you store and storage volume) to enforce plan limits and maintain server capacity.</li>
                        </ul>
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>3. Google OAuth 2.0 & User Data Policy</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        When you choose to sign in to Fort Sterling using your Google Account, we access basic profile information provided by Google's OAuth 2.0 service:
                        <ul style={{ marginTop: "8px", paddingLeft: "24px" }}>
                            <li><strong>Google Data Accessed:</strong> Your primary Google email address, verified email status, display name, and unique Google account identifier.</li>
                            <li><strong>Purpose of Use:</strong> This information is strictly used to authenticate your identity, establish your Fort Sterling account, and deliver security notices related to your account.</li>
                            <li><strong>No Sale or Third-Party Transfer:</strong> Fort Sterling does not sell, lease, trade, or transfer your Google user data to any third parties, advertisers, data brokers, or external AI model trainers.</li>
                            <li><strong>Google API Services User Data Policy Compliance:</strong> Fort Sterling's use and transfer of information received from Google APIs to any other app will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Google API Services User Data Policy</a>, including the Limited Use requirements.</li>
                            <li><strong>Revoking Access:</strong> You can disconnect Fort Sterling's access to your Google account at any time via your <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>Google Account Security Permissions</a>.</li>
                        </ul>
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>4. How We Use Your Information</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        We use the information we collect solely to operate, maintain, and improve the Service. Your email address is used for critical authentication emails, verification, and service alerts. We never sell personal information.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>5. Data Security</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        We employ industry-standard cryptographic practices to protect your data. All vault records and uploaded files are protected with AES-256-GCM authenticated encryption and PBKDF2 key derivation directly on your client device before transmission.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>6. Data Retention & Deletion</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        We retain your encrypted data only for as long as your account remains active. You can delete your account and all associated encrypted credentials, history, and uploaded files at any time via Settings &gt; Delete Account. Upon deletion, all records are permanently removed from our active databases and storage buckets.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>7. Contact Information</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        If you have questions, comments, or requests regarding this Privacy Policy or our data practices, please contact us at: <a href="mailto:bryankeithmayor1@gmail.com" style={{ color: "var(--accent)" }}>bryankeithmayor1@gmail.com</a>.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)" }}>8. Changes to This Policy</h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        We may update this Privacy Policy from time to time. We will notify you of any material changes by updating the "Last updated" date at the top of this page.
                    </p>
                </div>
                </div>
            </div>
        </MarketingLayout>
    );
}
