import { signOut } from "firebase/auth";
import { useAuth } from "../AuthContext";
import { auth } from "../firebase";

export default function AccountBar() {
  const { user, loading } = useAuth();

  let status = "Not signed in";
  if (loading) status = "Checking sign-in…";
  else if (user) status = `Signed in as ${user.displayName || user.email}`;

  return (
    <div className="account-bar">
      <span className="muted small">{status}</span>
      {user && (
        <button type="button" onClick={() => signOut(auth)} className="small">
          Log out
        </button>
      )}
    </div>
  );
}
