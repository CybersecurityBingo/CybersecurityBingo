import { useAuth } from "../AuthContext";
import { JankLoginButton, JankSignupButton } from "../JankButtons";

// Firebase sign-in status + the team's login/sign-up buttons.
export default function AccountBar() {
  const { user, loading, configured } = useAuth();

  let status = "Not signed in";
  if (!configured) status = "Accounts not set up yet";
  else if (loading) status = "Checking sign-in…";
  else if (user) status = `Signed in as ${user.email}`;

  return (
    <div className="account-bar">
      <span className="muted small">{status}</span>
      <div className="row">
        <JankLoginButton />
        <JankSignupButton />
      </div>
    </div>
  );
}
