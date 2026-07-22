import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "../firebaseConfig";
import { setDoc, doc, getDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { FiAlertCircle, FiLoader } from "react-icons/fi";

export default function AuthCallback() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const handleAuth = async () => {
            const token = searchParams.get("token");
            const err = searchParams.get("error");

            if (err) {
                setError(err === "auth_failed" ? "Authentication failed." : "An error occurred during sign in.");
                return;
            }

            if (!token) {
                setError("No authentication token found in URL.");
                return;
            }

            try {
                // Sign in with the custom token minted by our Firebase Function
                const userCredential = await signInWithCustomToken(auth, token);
                const user = userCredential.user;

                // Check if user exists in Firestore
                const userDoc = await getDoc(doc(db, "users", user.uid));
                if (!userDoc.exists()) {
                    // Create basic profile if they are completely new
                    await setDoc(doc(db, "users", user.uid), {
                        email: user.email,
                        fullName: user.displayName || "",
                        createdAt: new Date().toISOString(),
                    });
                }

                // Redirect back to root where App.tsx will pick up the authenticated state
                navigate("/", { replace: true });
            } catch (error: any) {
                console.error("Custom token sign-in error:", error);
                setError(error.message || "Failed to sign in with token.");
            }
        };

        handleAuth();
    }, [searchParams, navigate]);

    if (error) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "var(--bg-primary)", color: "var(--text-primary)", flexDirection: "column", gap: "16px" }}>
                <FiAlertCircle size={48} color="var(--red-accent)" />
                <h2 style={{ margin: 0 }}>Authentication Error</h2>
                <p style={{ color: "var(--text-secondary)" }}>{error}</p>
                <button onClick={() => navigate("/login")} style={{ padding: "10px 24px", background: "var(--red-accent)", color: "white", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer", marginTop: "16px" }}>
                    Back to Login
                </button>
            </div>
        );
    }

    return (
        <div style={{ minHeight: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: "var(--bg-primary)", color: "var(--text-primary)", flexDirection: "column", gap: "24px" }}>
            <FiLoader size={48} className="spin" color="var(--red-accent)" />
            <h2 style={{ margin: 0 }}>Completing Sign In...</h2>
            <p style={{ color: "var(--text-secondary)" }}>Please wait while we secure your session.</p>
            <style>{`
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
