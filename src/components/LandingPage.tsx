import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { FiArrowRight, FiShield, FiLock, FiCheckCircle, FiCheck, FiFolder, FiChevronDown, FiChevronUp } from "react-icons/fi";

function FAQItem({ question, answer }: { question: string, answer: string }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div style={{ borderBottom: "1px solid var(--border-color)", padding: "24px 0" }}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", color: "var(--text-primary)", fontSize: "1.1rem", fontWeight: "600", cursor: "pointer", textAlign: "left", padding: 0 }}
            >
                {question}
                {isOpen ? <FiChevronUp /> : <FiChevronDown />}
            </button>
            {isOpen && (
                <div style={{ marginTop: "16px", color: "var(--text-secondary)", lineHeight: "1.6", fontSize: "1rem" }}>
                    {answer}
                </div>
            )}
        </div>
    );
}

export default function LandingPage() {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        if (location.hash) {
            setTimeout(() => {
                const element = document.getElementById(location.hash.slice(1));
                if (element) {
                    element.scrollIntoView({ behavior: "smooth" });
                }
            }, 100);
        } else {
            window.scrollTo(0, 0);
        }
    }, [location]);

    return (
        <div data-theme="dark" style={{ background: "var(--bg-primary)", color: "var(--text-primary)", minHeight: "100vh", position: "relative", overflowX: "hidden" }}>
            
            {/* Header Navbar */}
            <header style={{ padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 10, background: "var(--bg-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", fontWeight: "700", fontSize: "1.2rem", color: "var(--text-primary)" }}>
                    <img src="/logo.png" alt="Fort Sterling Logo" style={{ width: 32, height: 32 }} />
                    Fort Sterling
                </div>
                
                <nav className="hide-on-mobile" style={{ display: "flex", gap: "32px", alignItems: "center" }}>
                    <Link to="/" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500", transition: "var(--transition)" }} onMouseOver={e => e.currentTarget.style.color = "var(--text-primary)"} onMouseOut={e => e.currentTarget.style.color = "var(--text-secondary)"}>Home</Link>
                    <a href="#features" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500", transition: "var(--transition)" }} onMouseOver={e => e.currentTarget.style.color = "var(--text-primary)"} onMouseOut={e => e.currentTarget.style.color = "var(--text-secondary)"}>Features</a>
                    <a href="#pricing" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500", transition: "var(--transition)" }} onMouseOver={e => e.currentTarget.style.color = "var(--text-primary)"} onMouseOut={e => e.currentTarget.style.color = "var(--text-secondary)"}>Pricing</a>
                    <a href="#trust" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500", transition: "var(--transition)" }} onMouseOver={e => e.currentTarget.style.color = "var(--text-primary)"} onMouseOut={e => e.currentTarget.style.color = "var(--text-secondary)"}>Trust Center</a>
                </nav>

                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <Link to="/login" style={{ padding: "8px 30px", fontSize: "1rem", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-color)", cursor: "pointer", transition: "var(--transition)", textDecoration: "none" }} onClick={() => {
                                    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                                }} onMouseOver={e => e.currentTarget.style.background = "var(--bg-input)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>Log In</Link>
                </div>
            </header>

            <div className="landing-page-content">
                {/* Split Hero Section */}
                <section style={{ padding: "80px 24px", position: "relative", display: "flex", alignItems: "center", minHeight: "calc(100vh - 200px)", overflow: "hidden" }}>
                    <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", alignItems: "center", gap: "64px", flexWrap: "wrap", position: "relative", zIndex: 2, width: "100%" }}>
                        {/* Left: Text Content */}
                        <div style={{ flex: "1 1 500px" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", padding: "6px 16px", color: "var(--primary-text)", fontSize: "0.9rem", fontWeight: "600", marginBottom: "24px", letterSpacing: "0.02em" }}>
                                Fort Sterling Security Services
                            </div>
                            <h1 style={{ fontSize: "4.5rem", fontWeight: "800", marginBottom: "24px", lineHeight: "1.1", letterSpacing: "-0.04em", color: "var(--ivory)" }}>
                                The zero-knowledge<br />
                                <span style={{ color: "var(--text-secondary)" }}>credential manager</span>
                            </h1>
                            <p style={{ fontSize: "1.25rem", color: "var(--text-secondary)", marginBottom: "40px", lineHeight: "1.6", maxWidth: "540px" }}>
                                Fort Sterling secures your passwords and sensitive documents in a unified platform. Client-side encryption ensures that your data remains completely inaccessible to everyone—even us.
                            </p>
                            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                                <button style={{ padding: "16px 32px", fontSize: "1.1rem", borderRadius: "var(--radius-md)", background: "var(--red-accent)", color: "var(--bg-primary)", border: "none", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", transition: "var(--transition)" }} onClick={() => navigate("/login")} onMouseOver={e => e.currentTarget.style.background = "var(--red-accent-hover)"} onMouseOut={e => e.currentTarget.style.background = "var(--red-accent)"}>
                                    Create Your Vault <FiArrowRight />
                                </button>
                                <button style={{ padding: "16px 32px", fontSize: "1.1rem", borderRadius: "var(--radius-md)", background: "transparent", color: "var(--text-primary)", border: "1px solid var(--border-color)", fontWeight: "600", cursor: "pointer", transition: "var(--transition)" }} onClick={() => {
                                    document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                                }} onMouseOver={e => e.currentTarget.style.background = "var(--bg-input)"} onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                                    Explore Features
                                </button>
                            </div>
                            
                            <div style={{ marginTop: "48px", display: "flex", alignItems: "center", gap: "24px", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><FiCheckCircle color="var(--red-accent)" /> AES-256-GCM</div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><FiCheckCircle color="var(--red-accent)" /> PBKDF2</div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><FiCheckCircle color="var(--red-accent)" /> No Trackers</div>
                            </div>
                        </div>

                        {/* Right: Premium 3D Visual */}
                        <div style={{ flex: "1 1 400px", display: "flex", justifySelf: "center", position: "relative" }}>
                            <div style={{ position: "relative", width: "100%", maxWidth: "500px", margin: "0 auto", borderRadius: "24px", padding: "16px", background: "linear-gradient(145deg, rgba(255,255,255,0.05), transparent)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 100px rgba(241, 196, 15, 0.15)" }}>
                                <div style={{ 
                                    width: "100%", 
                                    padding: "32px", 
                                    borderRadius: "16px", 
                                    fontFamily: "'Fira Code', 'JetBrains Mono', monospace", 
                                    fontSize: "0.95rem", 
                                    lineHeight: "1.7",
                                    transform: "perspective(1000px) rotateY(0deg) rotateX(0deg) scale(1.1)",
                                }}
                                >
                                    <div style={{ display: "flex", gap: "6px", marginBottom: "16px" }}>
                                        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ff5f56" }} />
                                        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#ffbd2e" }} />
                                        <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#27c93f" }} />
                                    </div>
                                    <div style={{ color: "#e6e6e6", wordBreak: "break-all" }}>
                                        {"{"}<br/>
                                        &nbsp;&nbsp;<span style={{ color: "#7dcfff" }}>"encryptedMasterKey"</span>: <span style={{ color: "#c3e88d" }}>"a6d4a5f1fb961b0ab5328609:9dc85425b537c489b9b5ac1bf2f3452e097..."</span>,<br/>
                                        &nbsp;&nbsp;<span style={{ color: "#7dcfff" }}>"fullName"</span>: <span style={{ color: "#c3e88d" }}>"ffdf2ff0735f1c3f3076f798:a0b1eaf4c999b757c5f08b0cb647783cc952d475b033c..."</span>,<br/>
                                        &nbsp;&nbsp;<span style={{ color: "#7dcfff" }}>"createdAt"</span>: <span style={{ color: "#c3e88d" }}>"2024-03-15T10:30:00Z"</span>,<br/>
                                        &nbsp;&nbsp;<span style={{ color: "#7dcfff" }}>"updatedAt"</span>: <span style={{ color: "#c3e88d" }}>"2024-03-15T10:30:00Z"</span>,<br/>
                                        <br/>
                                        &nbsp;&nbsp;<span style={{ color: "#6272a4", fontStyle: "italic" }}>// The actual data is completely unreadable</span><br/>
                                        &nbsp;&nbsp;<span style={{ color: "#7dcfff" }}>"encryptedData"</span>: <span style={{ color: "#ffb86c", textShadow: "0 0 10px rgba(255, 184, 108, 0.4)" }}>"U2FsdGVkX19xO/V+Oq2H8v8b6tGkF9L0p+M/3..."</span><br/>
                                        {"}"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* Value Prop Banner */}
                <section style={{ borderTop: "1px solid var(--border-color)", borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)", padding: "64px 24px" }}>
                    <div style={{ maxWidth: "1000px", margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "48px", textAlign: "center" }}>
                        <div>
                            <FiLock size={32} color="var(--blue)" style={{ marginBottom: "16px" }} />
                            <h3 style={{ fontSize: "1.2rem", marginBottom: "8px", fontWeight: "600", color: "var(--text-primary)" }}>Local Encryption</h3>
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>Data is encrypted on your device before it ever hits the network.</p>
                        </div>
                        <div>
                            <FiShield size={32} color="var(--red-accent)" style={{ marginBottom: "16px" }} />
                            <h3 style={{ fontSize: "1.2rem", marginBottom: "8px", fontWeight: "600", color: "var(--text-primary)" }}>Zero-Knowledge</h3>
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>We never store or transmit your master password. Only you hold the keys.</p>
                        </div>
                        <div>
                            <FiCheckCircle size={32} color="var(--red-accent)" style={{ marginBottom: "16px" }} />
                            <h3 style={{ fontSize: "1.2rem", marginBottom: "8px", fontWeight: "600", color: "var(--text-primary)" }}>Open Transparency</h3>
                            <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>No hidden backdoors. Industry-standard cryptography protocols.</p>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section id="features" style={{ padding: "80px 24px", position: "relative", maxWidth: "1100px", margin: "0 auto" }}>
                    {/* Vertical connecting line */}
                    <div style={{ position: "absolute", left: "50%", top: "0", bottom: "0", width: "1px", background: "linear-gradient(to bottom, transparent, var(--border-color) 10%, var(--border-color) 90%, transparent)", transform: "translateX(-50%)", zIndex: -1, opacity: 0.5 }} className="hide-on-mobile" />

                    <div style={{ textAlign: "center", marginBottom: "100px" }}>
                        <h2 style={{ fontSize: "2.5rem", fontWeight: "700", letterSpacing: "-0.02em", color: "var(--text-primary)" }}>Engineered for Privacy</h2>
                    </div>

                    {/* Feature 1 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "64px", marginBottom: "120px", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 min(100%, 400px)", minWidth: 0, paddingRight: "40px" }} className="feature-text">
                            <FiLock size={40} color="var(--red-accent)" style={{ marginBottom: "24px", filter: "drop-shadow(0 0 12px rgba(241, 196, 15, 0.2))" }} />
                            <h3 style={{ fontSize: "1.75rem", marginBottom: "16px", fontWeight: "600", color: "var(--text-primary)" }}>Zero-Knowledge Encryption</h3>
                            <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", fontSize: "1.1rem" }}>
                                Your vault is encrypted locally on your device using AES-GCM before any data is sent to our servers. This protects both your credentials and uploaded files. We never have the key to decrypt your data.
                            </p>
                        </div>
                        <div className="feature-card" style={{ flex: "1 1 400px", minWidth: 0, maxWidth: "100%", background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", padding: "24px", boxShadow: "var(--shadow-lg)" }}>
                            <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px", marginBottom: "16px" }}>
                                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--danger)" }} />
                                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--warning)" }} />
                                <div style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--green)" }} />
                            </div>
                            <pre className="code-block" style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.85rem", overflowX: "auto" }}>
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
                        <div style={{ flex: "1 1 min(100%, 400px)", minWidth: 0, paddingLeft: "40px" }} className="feature-text">
                            <FiShield size={40} color="var(--green)" style={{ marginBottom: "24px", filter: "drop-shadow(0 0 12px rgba(63, 185, 80, 0.2))" }} />
                            <h3 style={{ fontSize: "1.75rem", marginBottom: "16px", fontWeight: "600", color: "var(--text-primary)" }}>Complete Transparency</h3>
                            <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", fontSize: "1.1rem" }}>
                                We believe security requires transparency. The mechanisms we use to protect your data are industry standards and clearly explained. No hidden backdoors.
                            </p>
                        </div>
                        <div className="feature-card" style={{ flex: "1 1 400px", minWidth: 0, maxWidth: "100%", background: "var(--bg-secondary)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", padding: "32px", boxShadow: "var(--shadow-lg)", position: "relative", overflow: "hidden" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px", position: "relative", zIndex: 1 }}>
                                <div style={{ background: "var(--bg-input)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "4px" }}>PBKDF2</div>
                                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>100,000 Iterations</div>
                                </div>
                                <div style={{ background: "var(--bg-input)", padding: "16px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
                                    <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "4px" }}>Encryption Standard</div>
                                    <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>AES-256-GCM</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Feature 3 */}
                    <div style={{ display: "flex", alignItems: "center", gap: "64px", marginBottom: "0px", flexWrap: "wrap" }}>
                        <div style={{ flex: "1 1 min(100%, 400px)", minWidth: 0, paddingRight: "40px" }} className="feature-text">
                            <FiFolder size={40} color="var(--blue)" style={{ marginBottom: "24px", filter: "drop-shadow(0 0 12px rgba(59, 130, 246, 0.2))" }} />
                            <h3 style={{ fontSize: "1.75rem", marginBottom: "16px", fontWeight: "600", color: "var(--text-primary)" }}>All-in-One Secure Platform</h3>
                            <p style={{ color: "var(--text-secondary)", lineHeight: "1.6", fontSize: "1.1rem" }}>
                                Why manage separate apps for passwords and sensitive documents? Fort Sterling lets you store credentials alongside small, important files such as IDs, financial records, and medical documents, with a unified zero-knowledge architecture.
                            </p>
                        </div>
                        <div className="feature-card" style={{ flex: "1 1 400px", minWidth: 0, maxWidth: "100%", position: "relative", display: "flex", justifyContent: "center" }}>
                            <div style={{ width: "240px", height: "480px", maxWidth: "100%", background: "var(--bg-secondary)", borderRadius: "32px", border: "8px solid var(--border-color)", padding: "16px", boxShadow: "var(--shadow-lg)", position: "relative" }}>
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

                {/* Pricing Section */}
                <section id="pricing" style={{ padding: "80px 24px 120px" }}>
                    <div style={{ maxWidth: "1000px", margin: "0 auto", textAlign: "center" }}>
                        <h2 style={{ fontSize: "3.5rem", fontWeight: "800", letterSpacing: "-0.02em", marginBottom: "16px", color: "var(--text-primary)" }}>Simple, Transparent Pricing</h2>
                        <p style={{ fontSize: "1.2rem", color: "var(--text-secondary)", marginBottom: "64px" }}>
                            Start for free, upgrade when you need more.
                        </p>
                        
                        <div className="pricing-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "32px", textAlign: "left" }}>
                            {/* Free Tier */}
                            <div className="pricing-card" style={{ padding: "40px", background: "var(--bg-card)", borderRadius: "var(--radius-lg)", border: "1px solid var(--border-color)", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-md)" }}>
                                <h3 style={{ fontSize: "1.5rem", marginBottom: "8px", color: "var(--text-primary)" }}>Free</h3>
                                <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>For individuals getting started.</p>
                                <div style={{ fontSize: "3rem", fontWeight: "700", marginBottom: "32px", color: "var(--text-primary)" }}>$0<span style={{ fontSize: "1rem", color: "var(--text-secondary)", fontWeight: "400" }}>/month</span></div>
                                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 40px", display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--text-primary)" /> Up to 10 credentials</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--text-primary)" /> Last 3 password history</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--text-primary)" /> 500MB storage</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--text-primary)" /> 20MB upload limit</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--text-primary)" /> No ads</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--text-primary)" /> End-to-end encryption</li>
                                </ul>
                                <Link to="/login" style={{ display: "block", textAlign: "center", textDecoration: "none", color: "var(--text-primary)", padding: "12px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)", fontWeight: "600" }}>Get Started Free</Link>
                            </div>

                            {/* Pro Tier */}
                            <div className="pricing-card" style={{ padding: "40px", background: "linear-gradient(145deg, rgba(241, 196, 15, 0.05), transparent)", borderRadius: "var(--radius-lg)", border: "1px solid var(--red-accent)", position: "relative", display: "flex", flexDirection: "column", boxShadow: "0 0 40px rgba(241, 196, 15, 0.1)" }}>
                                <div style={{ position: "absolute", top: "-14px", left: "50%", transform: "translateX(-50%)", background: "var(--red-accent)", color: "var(--bg-primary)", padding: "4px 16px", borderRadius: "999px", fontSize: "0.85rem", fontWeight: "700" }}>Most Popular</div>
                                <h3 style={{ fontSize: "1.5rem", marginBottom: "8px", color: "var(--text-primary)" }}>Pro</h3>
                                <p style={{ color: "var(--text-secondary)", marginBottom: "24px" }}>For power users and professionals.</p>
                                <div style={{ fontSize: "3rem", fontWeight: "700", marginBottom: "32px", color: "var(--text-primary)" }}>$3.20<span style={{ fontSize: "1rem", color: "var(--text-secondary)", fontWeight: "400" }}>/month</span></div>
                                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 40px", display: "flex", flexDirection: "column", gap: "16px", flex: 1 }}>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-primary)" }}><FiCheck color="var(--red-accent)" /> <strong>Up to 1,000 credentials</strong></li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-primary)" }}><FiCheck color="var(--red-accent)" /> <strong>Full password history</strong></li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-primary)" }}><FiCheck color="var(--red-accent)" /> <strong>5GB storage</strong></li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-primary)" }}><FiCheck color="var(--red-accent)" /> <strong>No upload limit</strong></li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--red-accent)" /> No ads</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--red-accent)" /> End-to-end encryption</li>
                                    <li style={{ display: "flex", gap: "12px", alignItems: "center", color: "var(--text-secondary)" }}><FiCheck color="var(--red-accent)" /> 30-day free trial</li>
                                </ul>
                                <Link to="/login" style={{ display: "block", textAlign: "center", textDecoration: "none", color: "var(--bg-primary)", padding: "12px", background: "var(--red-accent)", borderRadius: "var(--radius-md)", fontWeight: "700" }}>Sign Up to get Pro</Link>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Trust Center Section */}
                <section id="trust" style={{ padding: "80px 24px", color: "var(--text-primary)", background: "var(--bg-secondary)", borderTop: "1px solid var(--border-color)" }}>
                    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
                        <div style={{ textAlign: "center", marginBottom: "48px" }}>
                            <h2 style={{ fontSize: "2.5rem", fontWeight: "700", marginBottom: "16px", letterSpacing: "-0.02em" }}>Trust Center</h2>
                            <p style={{ color: "var(--text-secondary)", fontSize: "1.1rem" }}>
                                We are committed to complete transparency. Learn how we protect your data.
                            </p>
                        </div>

                        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-lg)", padding: "32px", marginBottom: "48px" }}>
                            <h3 style={{ fontSize: "1.2rem", marginBottom: "24px", display: "flex", alignItems: "center", gap: "8px" }}>
                                <FiCheckCircle color="var(--green)" /> Security at a Glance
                            </h3>
                            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "16px", color: "var(--text-secondary)" }}>
                                <li style={{ display: "flex", alignItems: "center", gap: "12px" }}><FiLock color="var(--text-primary)" /> Client-side AES-256-GCM encryption</li>
                                <li style={{ display: "flex", alignItems: "center", gap: "12px" }}><FiLock color="var(--text-primary)" /> PBKDF2 key derivation (100,000 iterations)</li>
                                <li style={{ display: "flex", alignItems: "center", gap: "12px" }}><FiLock color="var(--text-primary)" /> Zero-knowledge architecture</li>
                                <li style={{ display: "flex", alignItems: "center", gap: "12px" }}><FiLock color="var(--text-primary)" /> Secure Firebase authentication</li>
                            </ul>
                        </div>

                        <h3 style={{ fontSize: "1.5rem", marginBottom: "24px", fontWeight: "600" }}>Frequently Asked Questions</h3>
                        <div style={{ borderTop: "1px solid var(--border-color)" }}>
                            <FAQItem 
                                question="What is Fort Sterling?" 
                                answer="Fort Sterling is a secure, zero-knowledge credential manager designed to keep your passwords and sensitive information completely safe." 
                            />
                            <FAQItem 
                                question="Why do you need zero-knowledge architecture?" 
                                answer="Our zero-knowledge architecture ensures that all encryption happens locally on your device. We never receive your Master Password or the derived keys, meaning it is mathematically impossible for us or anyone else to access your data." 
                            />
                            <FAQItem 
                                question="How does the encryption work?" 
                                answer="We use client-side AES-256-GCM encryption and PBKDF2 for key derivation. Your data is encrypted before it ever leaves your device." 
                            />
                            <FAQItem 
                                question="What happens if I lose my Master Password?" 
                                answer="Because we use zero-knowledge encryption, we cannot reset or recover your password. If you lose your Master Password and Recovery Key, your vault is permanently lost. This guarantees your data's privacy." 
                            />
                            <FAQItem 
                                question="What data is tracked?" 
                                answer="We only track anonymized metadata such as the number of credentials you store (to enforce free-tier limits) and basic billing information. We do not track the content, platform names, or usernames you store in your vault." 
                            />
                            <FAQItem 
                                question="Is there a mobile app available?" 
                                answer="Our web application is fully responsive and designed to work seamlessly on mobile browsers." 
                            />
                            <FAQItem 
                                question="How much does Fort Sterling cost?" 
                                answer="We offer a generous free tier for basic personal use. Premium features and expanded storage are available through our paid subscription plans." 
                            />
                        </div>
                    </div>
                </section>
            </div>

            {/* Footer */}
            <footer style={{ padding: "60px 24px", borderTop: "1px solid var(--border-color)", background: "var(--bg-primary)", position: "relative", zIndex: 10 }}>
                <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "32px" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", fontWeight: "700", fontSize: "1.1rem", marginBottom: "16px", color: "var(--text-primary)" }}>
                            <img src="/logo.png" alt="Fort Sterling Logo" style={{ width: 24, height: 24 }} />
                            Fort Sterling
                        </div>
                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", maxWidth: "300px" }}>
                            The zero-knowledge credential manager.
                        </p>
                    </div>
                    <div style={{ display: "flex", gap: "48px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <h4 style={{ fontSize: "0.95rem", marginBottom: "8px", color: "var(--text-primary)" }}>Product</h4>
                            <Link to="/login" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Log In</Link>
                            <a href="#features" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Features</a>
                            <a href="#pricing" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Pricing</a>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <h4 style={{ fontSize: "0.95rem", marginBottom: "8px", color: "var(--text-primary)" }}>Legal</h4>
                            <Link to="/terms" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Terms of Service</Link>
                            <Link to="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Privacy Policy</Link>
                            <Link to="/transparency" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Transparency</Link>
                            <a href="#trust" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Trust Center</a>
                        </div>
                    </div>
                </div>
                <div style={{ maxWidth: "1200px", margin: "48px auto 0", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.85rem", paddingTop: "24px" }}>
                    &copy; {new Date().getFullYear()} Fort Sterling. All rights reserved.
                </div>
            </footer>

            <style>{`
                @media (max-width: 768px) {
                    .hide-on-mobile { display: none !important; }
                    .feature-text { padding: 0 !important; text-align: center; }
                    .pricing-grid { grid-template-columns: 1fr !important; }
                    .pricing-card { padding: 24px !important; }
                    .feature-card { padding: 16px !important; flex-basis: 100% !important; }
                    .code-block::-webkit-scrollbar { display: none; }
                    .code-block { -ms-overflow-style: none; scrollbar-width: none; }
                }
            `}</style>
        </div>
    );
}
