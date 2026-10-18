import { useState, type FormEvent } from "react";
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";

import { auth } from "../firebase";

interface AuthFormProps {
    onSuccess?: () => void;
}

export default function AuthForm ({onSuccess}:AuthFormProps) {
    const[error, setError] = useState<string>("");
    const[loading, setLoading] = useState<boolean>(false);
    const[email, setEmail] = useState<string>("");
    const[pw, setPw] = useState<string>("");
    const[isSignUp, setSignUp] = useState<boolean>(false);

    function formatAuthError(code: string): string {
    switch (code) {
        case "auth/invalid-credential":
        case "auth/wrong-password":
        case "auth/user-not-found":
            return "Invalid email or password.";
        case "auth/email-already-in-use":
            return "An account with this email already exists.";
        case "auth/weak-password":
            return "Password should be at least 6 characters.";
        case "auth/invalid-email":
            return "Please enter a valid email address.";
        default:
            return "Authentication failed. Please try again.";
        }
    }

    async function handleSubmit(e: FormEvent) {
      e.preventDefault();
      
        if(!auth) {
            setError("Firebase Auth is not set up. Please check env");
            return;
        }
        setError("");
        setLoading(true);

        try {
            if(isSignUp) {
                await createUserWithEmailAndPassword(auth, email, pw);
            } else {
                await signInWithEmailAndPassword(auth, email, pw);
            }
            onSuccess?.();
        } catch (err: unknown) {
            const firebaseError = err as { code?: string };
            setError(formatAuthError(firebaseError?.code || ""));
        } finally {
            setLoading(false);
        }
    }

    return (
    <div className="panel narrow">
      <h1>White Hat Bingo</h1>
      <p className="muted">
        {isSignUp ? "Create an account to play" : "Sign in to get your card"}
      </p>

      <form onSubmit={handleSubmit}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          autoFocus
        />

        <label htmlFor="password" style={{ marginTop: "12px", display: "block" }}>
          Password
        </label>
        <input
          id="password"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="••••••••"
          required
        />

        {error && <p className="banner warn" style={{ marginTop: "12px" }}>{error}</p>}

        <button
          type="submit"
          className="primary big"
          disabled={loading || !email || !pw}
          style={{ width: "100%", marginTop: "16px" }}
        >
          {loading ? "Processing…" : isSignUp ? "Create Account" : "Sign In"}
        </button>
      </form>

      <p className="muted small" style={{ textAlign: "center", marginTop: "16px" }}>
        {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setSignUp(!isSignUp);
            setError("");
          }}
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            textDecoration: "underline",
            cursor: "pointer",
            padding: 0,
            font: "inherit",
          }}
        >
          {isSignUp ? "Sign In" : "Sign Up"}
        </button>
      </p>
    </div>
  );
}
