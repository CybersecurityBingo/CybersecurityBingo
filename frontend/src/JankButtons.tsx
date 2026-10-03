// src/components/LoginButton.jsx
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useAuth } from "./AuthContext";

export function JankLoginButton() {
  const { user, loading } = useAuth();

  async function handleLogin() {
    const email = prompt("Email:");
    if (!email) return;
    const password = prompt("Password:");
    if (!password) return;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      alert(`Login failed: ${e.code}`);
    }
  }

  if (loading) return null;
  return user ? (
    <button onClick={() => signOut(auth)}>Log out ({user.email})</button>
  ) : (
    <button onClick={handleLogin}>Log in</button>
  );
}

export function JankSignupButton() {
  const { user, loading } = useAuth();

  async function handleSignup() {
    const email = prompt("Email:");
    if (!email) return;
    const password = prompt("Password:");
    if (!password) return;
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      alert(`Signup failed: ${e.code}`);
    }
  }

  if (loading) return null;
  return user ? <button disabled>Already signed in</button> : <button onClick={handleSignup}>Create account</button>;
}