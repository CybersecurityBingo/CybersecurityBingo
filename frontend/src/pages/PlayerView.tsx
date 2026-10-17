import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, errorStatus } from "../api";
import usePolling from "../usePolling";
import { useAuth } from "../AuthContext";
import AccountBar from "../components/AccountBar";
import BingoCard from "../components/BingoCard";
import QuestionFeed from "../components/QuestionFeed";
import type { BingoClaim, PlayerState } from "../types";

const STORAGE_KEY = "bingo.playerId";

const store = {
  get: (): string | null => {
    try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
  },
  set: (v: string) => {
    try { localStorage.setItem(STORAGE_KEY, v); } catch { /* private mode */ }
  },
  clear: () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* private mode */ }
  },
};

export default function PlayerView() {
  const [playerId, setPlayerId] = useState<string | null>(store.get);
  const [state, setState] = useState<PlayerState | null>(null);
  const [connError, setConnError] = useState("");
  const [claim, setClaim] = useState<BingoClaim | null>(null);

  usePolling(
    async () => {
      try {
        setState(await api<PlayerState>(`/player/${playerId}`));
        setConnError("");
      } catch (e) {
        if (errorStatus(e) === 404) {
          // Game was reset or the ID is stale - send them back to the join screen.
          store.clear();
          setPlayerId(null);
          setState(null);
          setClaim(null);
        } else {
          setConnError("Can't reach the server - retrying…");
        }
      }
    },
    2000,
    Boolean(playerId)
  );

  if (!playerId) {
    return (
      <JoinForm
        onJoined={(id) => {
          store.set(id);
          setPlayerId(id);
        }}
      />
    );
  }

  if (!state) {
    return <main className="page center"><p className="muted">{connError || "Loading your card…"}</p></main>;
  }

  async function toggle(index: number) {
    // Optimistic update so the square responds instantly.
    setState((s) => {
      if (!s) return s;
      const marks = new Set(s.marks);
      if (marks.has(index)) marks.delete(index);
      else marks.add(index);
      return { ...s, marks: [...marks] };
    });
    try {
      const { marks } = await api<{ marks: number[] }>(`/player/${playerId}/mark`, { method: "POST", body: { index } });
      setState((s) => (s ? { ...s, marks } : s));
    } catch (e) {
      setConnError(errorMessage(e));
    }
  }

  async function callBingo() {
    try {
      setClaim(await api<BingoClaim>(`/player/${playerId}/bingo`, { method: "POST" }));
    } catch (e) {
      setClaim({ valid: false, message: errorMessage(e) });
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>White Hat Bingo</h1>
          <p className="muted">Playing as <strong>{state.name}</strong></p>
        </div>
        {state.winners.length > 0 && (
          <div className="winners" aria-live="polite">🏆 {state.winners.join(", ")}</div>
        )}
      </header>
      <AccountBar />

      {connError && <p className="banner warn">{connError}</p>}

      <div className="layout">
        <section className="panel" aria-labelledby="game-h">
          <h2 id="game-h">Your card</h2>
          <p className="muted small">Read the host's question, then tap the matching square.</p>
          <BingoCard
            card={state.card}
            marks={state.marks}
            onToggle={toggle}
            winLine={claim?.line || []}
            disabled={state.won}
          />
          {state.won ? (
            <p className="banner good">You have BINGO! Show this code to the host: <code>{state.checksum.slice(0, 12)}</code></p>
          ) : (
            <button className="primary big" onClick={callBingo}>BINGO!</button>
          )}
          {claim && !claim.valid && <p className="banner warn">{claim.message}</p>}
          <p className="muted small">Card ID: <code>{state.checksum.slice(0, 12)}</code></p>
        </section>

        <section className="panel" aria-labelledby="q-h">
          <h2 id="q-h">Questions from the host</h2>
          <div aria-live="polite">
            <QuestionFeed called={state.called} emptyText="Waiting for the host to send the first question…" />
          </div>
        </section>
      </div>
    </main>
  );
}

function JoinForm({ onJoined }: { onJoined: (id: string) => void }) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Signed in with a Firebase account? Suggest a name from it.
  useEffect(() => {
    if (user && !name) setName((user.displayName || user.email?.split("@")[0] || "").slice(0, 30));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { player_id } = await api<{ player_id: string }>("/join", { method: "POST", body: { name } });
      onJoined(player_id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page center">
      <form className="panel narrow" onSubmit={submit}>
        <h1>White Hat Bingo</h1>
        <p className="muted">Enter your name to get a card.</p>
        <label htmlFor="name">Name</label>
        <input id="name" value={name} maxLength={30} autoFocus onChange={(e) => setName(e.target.value)} />
        {error && <p className="banner warn">{error}</p>}
        <button className="primary" disabled={busy || !name.trim()}>
          {busy ? "Joining…" : "Get my card"}
        </button>
        <AccountBar />
        <ServerStatus />
      </form>
    </main>
  );
}

// The team's original connection test: calls /api/data and shows whether Flask answered.
function ServerStatus() {
  const [status, setStatus] = useState("Checking server…");

  useEffect(() => {
    api<{ msg: string; date: string }>("/data")
      .then((d) => setStatus(`Server: ${d.msg} (${d.date})`))
      .catch(() => setStatus("Server: not reachable - is Flask running on port 5001?"));
  }, []);

  return <p className="muted small">{status}</p>;
}
