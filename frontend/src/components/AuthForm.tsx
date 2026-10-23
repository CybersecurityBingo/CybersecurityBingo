import { useState } from "react";
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

const AUTH_ERRORS: Record<string, string> = {
  "auth/popup-closed-by-user": "Sign-in popup was closed before completion.",
  "auth/cancelled-popup-request": "Sign-in popup request was cancelled.",
  "auth/popup-blocked": "Your browser blocked the sign-in popup - allow popups and try again.",
  "auth/unauthorized-domain": "This domain is not authorized in Firebase Console.",
};

export default function AuthForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn() {
    setError("");
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "";
      setError(AUTH_ERRORS[code] ?? "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel narrow">
      <h1>White Hat Bingo</h1>
      <p className="muted">Sign in with your case.edu Google account to get your card.</p>
      {error && <p className="banner warn">{error}</p>}
      <button type="button" className="primary big" onClick={signIn} disabled={loading}>
        {loading ? "Signing in…" : "Sign in with Google"}
      </button>
    </div>
  );
}
