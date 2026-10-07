import PlayerView from "./pages/PlayerView";
import AdminView from "./pages/AdminView";

// Tiny router: /admin shows the host console, everything else is the player view.
function App() {
  const isAdmin = window.location.pathname.replace(/\/$/, "") === "/admin";
  return isAdmin ? <AdminView /> : <PlayerView />;
}

export default App;
