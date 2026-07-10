import { Link, useNavigate } from "react-router-dom";
import { FiShield, FiLock, FiSmartphone, FiArrowRight, FiCheck } from "react-icons/fi";

export default function LandingPage() {
    const navigate = useNavigate();

    return (
        <div className="landing-page" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-primary)", color: "var(--text-primary)", position: "relative", overflowX: "hidden" }}>
            
            {/* Nav */}
            <header style={{ padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", fontWeight: "700", fontSize: "1.2rem" }}>
                    <img src="/logo.png" alt="Fort Sterling Logo" style={{ width: 32, height: 32 }} />
                    Fort Sterling
                </div>
                <div style={{ display: "flex", gap: "16px" }}>
                    <Link to="/login" style={{ textDecoration: "none", color: "var(--text-primary)", fontWeight: "600", padding: "8px 16px", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>Log In</Link>
                </div>
            </header>

            {/* Glowing background effect (GitHub style) */}
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100vw", height: "800px", background: "radial-gradient(circle at center top, var(--accent-glow) 0%, transparent 70%)", zIndex: 0, pointerEvents: "none" }} />

            <main style={{ flex: 1, position: "relative", zIndex: 1 }}>
                {/* Hero */}
                <section style={{ padding: "120px 24px 80px", textAlign: "center", maxWidth: "900px", margin: "0 auto", position: "relative" }}>
                    <h1 style={{ fontSize: "4.5rem", fontWeight: "800", marginBottom: "24px", lineHeight: "1.1", letterSpacing: "-0.04em" }}>
                        The zero knowledge<br />
                        <span style={{ color: "var(--text-secondary)" }}>credential manager</span>
                    </h1>
                    <p style={{ fontSize: "1.25rem", color: "var(--text-secondary)", maxWidth: "700px", margin: "0 auto 16px", lineHeight: "1.6" }}>
                        Keep your passwords secure and instantly accessible with Fort Sterling, no more hunting through your notes. Client-side encryption ensures that not even we can see your passwords.
                    </p><br />
                    <div style={{ display: "flex", justifyContent: "center", gap: "16px" }}>
                        <button className="admin-btn-primary" style={{ padding: "16px 32px", fontSize: "1.1rem", borderRadius: "var(--radius-md)" }} onClick={() => navigate("/login")}>
                            Create Your Vault <FiArrowRight style={{ marginLeft: 8 }} />
                        </button>
                    </div>

                    <div style={{ marginTop: "64px", position: "relative", zIndex: 2, padding: "8px", background: "linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.0) 100%)", borderRadius: "24px", border: "1px solid var(--border-color)", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 80px var(--accent-glow)" }}>
                        <img src="/hero.png" alt="Secure Vault Dashboard Preview" style={{ width: "100%", height: "auto", borderRadius: "16px", display: "block", border: "1px solid rgba(255,255,255,0.05)" }} />
                    </div>
                </section>

                {/* Staggered Features with Connecting Line */}
                <section style={{ padding: "80px 24px", position: "relative", maxWidth: "1100px", margin: "0 auto" }}>
                    {/* Vertical connecting line */}
                    <div style={{ position: "absolute", left: "50%", top: "0", bottom: "0", width: "1px", background: "linear-gradient(to bottom, transparent, var(--border-color) 10%, var(--border-color) 90%, transparent)", transform: "translateX(-50%)", zIndex: -1, opacity: 0.5 }} className="hide-on-mobile" />

                    <div style={{ textAlign: "center", marginBottom: "100px" }}>
                        <h2 style={{ fontSize: "2.5rem", fontWeight: "700", letterSpacing: "-0.02em" }}>Engineered for Privacy</h2>
                    </div>

                    {/* Feature 1 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "64px", marginBottom: "120px", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 400px", paddingRight: "40px" }} className="feature-text">
                            <FiLock size={32} color="var(--accent)" style={{ marginBottom: "24px" }} />
                            <h3 style={{ fontSize: "1.75rem", marginBottom: "16px", fontWeight: "600" }}>Zero-Knowledge Encryption</h3>
                            <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", fontSize: "1.1rem" }}>
                                Your vault is encrypted locally on your device using AES-GCM before any data is sent to our servers. We never have the key to decrypt your data.
                            </p>
                        </div>
                        <div style={{ flex: "1 1 400px", background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", padding: "24px", boxShadow: "var(--shadow-lg)" }}>
                            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px", marginBottom: "16px" }}>
                                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--danger)" }} />
                                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--warning)" }} />
                                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--green)" }} />
                            </div>
                            <pre style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem", overflowX: "auto" }}>
                                <code>
{`// Client-side encryption only
const pdk = await deriveKey(password, salt);
const iv = window.crypto.getRandomValues(new Uint8Array(12));

const encrypted = await crypto.subtle.encrypt(
  { name: "AES-GCM", iv },
  pdk,
  new TextEncoder().encode(vaultData)
);

// We never see your password
await sendToServer(encrypted, iv);`}
                                </code>
                            </pre>
                        </div>
                    </div>

                    {/* Feature 2 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "64px", marginBottom: "120px", flexWrap: "wrap", flexDirection: "row-reverse" }}>
                        <div style={{ flex: "1 1 400px", paddingLeft: "40px" }} className="feature-text">
                            <FiShield size={32} color="var(--green)" style={{ marginBottom: "24px" }} />
                            <h3 style={{ fontSize: "1.75rem", marginBottom: "16px", fontWeight: "600" }}>Complete Transparency</h3>
                            <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", fontSize: "1.1rem" }}>
                                We believe security requires transparency. The mechanisms we use to protect your data are industry standards and clearly explained. No hidden backdoors.
                            </p>
                        </div>
                        <div style={{ flex: "1 1 400px", background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", padding: "32px", boxShadow: "var(--shadow-lg)", position: "relative", overflow: "hidden" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "relative", zIndex: 1 }}>
                                <div style={{ background: "var(--bg-input)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "4px" }}>PBKDF2</div>
                                    <div style={{ fontWeight: 600 }}>100,000 Iterations</div>
                                </div>
                                <div style={{ background: "var(--bg-input)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "4px" }}>Encryption Standard</div>
                                    <div style={{ fontWeight: 600 }}>AES-256-GCM</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Feature 3 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "64px", marginBottom: "0px", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 400px", paddingRight: "40px" }} className="feature-text">
                            <FiSmartphone size={32} color="var(--text-primary)" style={{ marginBottom: "24px" }} />
                            <h3 style={{ fontSize: "1.75rem", marginBottom: "16px", fontWeight: "600" }}>Cross-Device Sync</h3>
                            <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", fontSize: "1.1rem" }}>
                                Access your secure vault from anywhere. Your encrypted data safely syncs across all your devices, so you always have your passwords when you need them.
                            </p>
                        </div>
                        <div style={{ flex: "1 1 400px", position: "relative", display: "flex", justifyContent: "center" }}>
                            <div style={{ width: "240px", height: "480px", background: "var(--bg-secondary)", borderRadius: "32px", border: "8px solid var(--border-color)", padding: "16px", boxShadow: "var(--shadow-lg)", position: "relative" }}>
                                <div style={{ width: "40%", height: "4px", background: "var(--border-color)", borderRadius: "2px", margin: "0 auto 24px" }} />
                                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                    {[1, 2, 3, 4].map(i => (
                                        <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center", padding: "12px", background: "var(--bg-input)", borderRadius: "var(--radius-sm)" }}>
                                            <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: "var(--border-color)" }} />
                                            <div style={{ flex: 1, height: "12px", background: "var(--border-color)", borderRadius: "4px" }} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Stylized Pricing */}
                <section style={{ padding: "80px 24px 120px" }} id="pricing">
                    <div style={{ maxWidth: "1000px", margin: "0 auto", textAlign: "center" }}>
                        <h2 style={{ fontSize: "2.5rem", marginBottom: "16px", fontWeight: "700", letterSpacing: "-0.02em" }}>Simple, Transparent Pricing</h2>
                        <p style={{ fontSize: "1.1rem", color: "var(--text-secondary)", marginBottom: "64px" }}>
                            Start for free, upgrade when you need more.
                        </p>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "32px", textAlign: "left" }}>
                            {/* Free Tier */}
                            <div style={{ padding: "40px", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column" }}>
                                <h3 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Free</h3>
                                <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>For individuals getting started.</p>
                                <div style={{ fontSize: "3rem", fontWeight: "700", marginBottom: "32px" }}>$0<span style={{ fontSize: "1rem", color: "var(--text-secondary)", fontWeight: "400" }}>/month</span></div>
                                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 40px", display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--text-primary)" /> Store up to 10 credentials</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--text-primary)" /> Zero-knowledge encryption</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--text-primary)" /> Cross-device sync</li>
                                </ul>
                                <Link to="/login" style={{ display: "block", textAlign: "center", textDecoration: "none", color: "var(--text-primary)", padding: "12px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", fontWeight: "600" }}>Get Started Free</Link>
                            </div>

                            {/* Pro Tier */}
                            <div style={{ padding: "40px", background: "linear-gradient(145deg, rgba(88, 166, 255, 0.05), transparent)", borderRadius: "var(--radius-lg)", border: "1px solid var(--accent)", position: "relative", display: "flex", flexDirection: "column", boxShadow: "0 0 40px var(--accent-glow)" }}>
                                <div style={{ position: "absolute", top: "-14px", left: "50%", transform: "translateX(-50%)", background: "var(--accent)", color: "#000", padding: "4px 16px", borderRadius: "999px", fontSize: "0.85rem", fontWeight: "600" }}>Most Popular</div>
                                <h3 style={{ fontSize: "1.5rem", marginBottom: "8px" }}>Pro</h3>
                                <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>For power users and professionals.</p>
                                <div style={{ fontSize: "3rem", fontWeight: "700", marginBottom: "32px" }}>$3.99<span style={{ fontSize: "1rem", color: "var(--text-secondary)", fontWeight: "400" }}>/month</span></div>
                                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 40px", display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center" }}><FiCheck color="var(--accent)" /> <strong>Up to 1,000 credentials</strong></li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--accent)" /> Zero-knowledge encryption</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--accent)" /> Cross-device sync</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--accent)" /> Priority support</li>
                                </ul>
                                <Link to="/login" style={{ display: "block", textAlign: "center", textDecoration: "none", color: "#000", padding: "12px", background: "var(--accent)", borderRadius: "var(--radius-md)", fontWeight: "600" }}>Upgrade to Pro</Link>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer style={{ padding: "48px 24px", borderTop: "1px solid var(--border-color)", background: "var(--bg-secondary)", position: "relative", zIndex: 10 }}>
                <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "32px" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontWeight: "700", fontSize: "1.1rem", marginBottom: "16px" }}>
                            <img src="/logo.png" alt="Fort Sterling Logo" style={{ width: 24, height: 24 }} />
                            Fort Sterling
                        </div>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", maxWidth: "300px" }}>
                            The zero knowledge credential manager.
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "48px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <h4 style={{ fontSize: "0.95rem", marginBottom: "8px" }}>Product</h4>
                            <Link to="/login" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Log In</Link>
                            <a href="#pricing" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Pricing</a>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <h4 style={{ fontSize: "0.95rem", marginBottom: "8px" }}>Legal</h4>
                            <Link to="/terms" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Terms of Service</Link>
                            <Link to="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Privacy Policy</Link>
                        </div>
                    </div>
                </div>
                <div style={{ maxWidth: "1200px", margin: "48px auto 0", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem", borderTop: "1px solid var(--border-color)", paddingTop: "24px" }}>
                    &copy; {new Date().getFullYear()} Fort Sterling. All rights reserved.
                </div>
            </footer>

            <style>{`
                @media (max-width: 768px) {
                    .hide-on-mobile { display: none !important; }
                    .feature-text { padding: 0 !important; text-align: center; }
                }
            `}</style>
        </div>
    );
}
