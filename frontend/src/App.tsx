import PlayerView from "./pages/PlayerView";
import AdminView from "./pages/AdminView";
import { AuthProvider } from "./AuthContext";

function App() {
  const isAdmin = window.location.pathname.replace(/\/$/, "") === "/admin";

  return (
    <AuthProvider>
      {isAdmin ? <AdminView /> : <PlayerView />}
    </AuthProvider>
  );
}

export default App;