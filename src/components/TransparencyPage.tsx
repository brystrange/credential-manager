import { useEffect } from "react";
import { FiLock, FiDatabase, FiShield } from "react-icons/fi";
import MarketingLayout from "./MarketingLayout";

export default function TransparencyPage() {
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    return (
        <MarketingLayout>
            <div style={{ padding: "48px 24px", color: "var(--text-primary)" }}>
                <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                
                <h1 style={{ fontSize: "2.5rem", marginBottom: "16px" }}>Transparency</h1>
                <p style={{ color: "var(--text-secondary)", marginBottom: "48px", fontSize: "1.1rem" }}>
                    We believe in complete transparency about how your data is stored. Because we use a zero-knowledge architecture, even if our database was breached, your data would remain mathematically unreadable.
                </p>

                <div className="legal-content" style={{ lineHeight: "1.7", fontSize: "1.05rem" }}>
                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <FiDatabase /> How Your Data is Stored
                    </h2>
                    <p style={{ marginBottom: "16px", color: "var(--text-secondary)" }}>
                        When you save a credential or a file, it is encrypted on your local device <strong>before</strong> it is ever sent to our servers. Below is an exact sample of how a credential record looks in our database:
                    </p>

                    <div style={{ background: "var(--bg-card)", padding: "20px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", marginBottom: "32px", overflowX: "auto" }}>
                        <pre style={{ margin: 0, fontFamily: "monospace", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
{`{
  "id": "cred_xyz123",
  "userId": "user_abc987",
  "createdAt": "2024-03-15T10:30:00Z",
  "updatedAt": "2024-03-15T10:30:00Z",
  
  // The actual data is completely unreadable
  "encryptedData": "U2FsdGVkX19xO/V+Oq2H8v8b6tGkF9L0p+M/3..."
}`}
                        </pre>
                    </div>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <FiLock /> Client-Side Encryption
                    </h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        The <code>encryptedData</code> field contains all your sensitive information—including passwords, usernames, notes, and platform names. It is encrypted using AES-256-GCM. The encryption key is derived from your Vault Password, which is never transmitted to us.
                    </p>

                    <h2 style={{ fontSize: "1.5rem", marginTop: "32px", marginBottom: "16px", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                        <FiShield /> We Cannot Recover Your Data
                    </h2>
                    <p style={{ marginBottom: "24px", color: "var(--text-secondary)" }}>
                        Because we never receive or store your Vault Password or the derived encryption keys, we have absolutely no way to decrypt your data. If you lose your Vault Password and your Recovery Key, your data is permanently lost. This is the ultimate guarantee of your privacy.
                    </p>
                </div>
                </div>
            </div>
        </MarketingLayout>
    );
}
