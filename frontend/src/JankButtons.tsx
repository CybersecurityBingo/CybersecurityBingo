import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "./firebase";
import { useAuth } from "./AuthContext";

const errorCode = (e: unknown) => (e as { code?: string })?.code ?? String(e);

export function JankLoginButton() {
  const { user, loading } = useAuth();

  async function handleLogin() {
    if (!auth) return;
    const email = prompt("Email:");
    if (!email) return;
    const password = prompt("Password:");
    if (!password) return;
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      alert(`Login failed: ${errorCode(e)}`);
    }
  }

  if (!auth) return <button disabled title="Add the VITE_FIREBASE_* values to frontend/.env.local">Login not set up</button>;
  if (loading) return null;
  return user ? (
    <button onClick={() => signOut(auth!)}>Log out ({user.email})</button>
  ) : (
    <button onClick={handleLogin}>Log in</button>
  );
}

export function JankSignupButton() {
  const { user, loading } = useAuth();

  async function handleSignup() {
    if (!auth) return;
    const email = prompt("Email:");
    if (!email) return;
    const password = prompt("Password:");
    if (!password) return;
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      alert(`Signup failed: ${errorCode(e)}`);
    }
  }

  if (!auth || loading) return null;
  return user ? <button disabled>Already signed in</button> : <button onClick={handleSignup}>Create account</button>;
}
