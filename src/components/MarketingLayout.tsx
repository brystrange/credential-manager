import { Link } from "react-router-dom";
import React from "react";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-primary)", color: "var(--text-primary)", position: "relative", overflowX: "hidden" }}>
            
            {/* Unified Navbar */}
            <header style={{ padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative", zIndex: 10 }}>
                <Link to="/" style={{ display: "flex", alignItems: "center", gap: "12px", fontWeight: "700", fontSize: "1.2rem", textDecoration: "none", color: "var(--text-primary)" }}>
                    <img src="/logo.png" alt="Fort Sterling Logo" style={{ width: 32, height: 32 }} />
                    Fort Sterling
                </Link>
                
                <nav className="hide-on-mobile" style={{ display: "flex", gap: "32px", alignItems: "center" }}>
                    <Link to="/" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500", transition: "var(--transition)" }} onMouseOver={e => e.currentTarget.style.color = "var(--text-primary)"} onMouseOut={e => e.currentTarget.style.color = "var(--text-secondary)"}>Home</Link>
                    <a href="/#features" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500", transition: "var(--transition)" }} onMouseOver={e => e.currentTarget.style.color = "var(--text-primary)"} onMouseOut={e => e.currentTarget.style.color = "var(--text-secondary)"}>Features</a>
                    <a href="/#pricing" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500", transition: "var(--transition)" }} onMouseOver={e => e.currentTarget.style.color = "var(--text-primary)"} onMouseOut={e => e.currentTarget.style.color = "var(--text-secondary)"}>Pricing</a>
                    <a href="/#trust" style={{ color: "var(--text-secondary)", textDecoration: "none", fontWeight: "500", transition: "var(--transition)" }} onMouseOver={e => e.currentTarget.style.color = "var(--text-primary)"} onMouseOut={e => e.currentTarget.style.color = "var(--text-secondary)"}>Trust Center</a>
                </nav>

                <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
                    <Link to="/login" style={{ textDecoration: "none", color: "var(--ivory)", fontWeight: "600", padding: "8px 16px", background: "var(--red-accent)", borderRadius: "var(--radius-sm)", border: `1px solid var(--red-accent-hover)`, transition: "var(--transition)" }} onMouseOver={e => e.currentTarget.style.background = "var(--red-accent-hover)"} onMouseOut={e => e.currentTarget.style.background = "var(--red-accent)"}>Log In</Link>
                </div>
            </header>

            {/* Glowing background effect (GitHub style) */}
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100vw", height: "800px", background: "radial-gradient(circle at center top, var(--accent-glow) 0%, transparent 70%)", zIndex: 0, pointerEvents: "none" }} />

            <main style={{ flex: 1, position: "relative", zIndex: 1 }}>
                {children}
            </main>

            {/* Unified Footer */}
            <footer style={{ padding: "48px 24px", borderTop: "1px solid var(--border-color)", background: "var(--bg-secondary)", position: "relative", zIndex: 10 }}>
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
                            <a href="/#features" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Features</a>
                            <a href="/#pricing" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Pricing</a>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            <h4 style={{ fontSize: "0.95rem", marginBottom: "8px", color: "var(--text-primary)" }}>Legal</h4>
                            <Link to="/terms" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Terms of Service</Link>
                            <Link to="/privacy" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Privacy Policy</Link>
                            <Link to="/transparency" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Transparency</Link>
                            <a href="/#trust" style={{ color: "var(--text-secondary)", textDecoration: "none", fontSize: "0.9rem" }}>Trust Center</a>
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
                }
            `}</style>
        </div>
    );
}
