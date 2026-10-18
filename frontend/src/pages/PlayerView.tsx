import { useEffect, useState } from "react";
import { api, errorMessage, errorStatus } from "../api";
import usePolling from "../usePolling";
import { useAuth } from "../AuthContext";
import AccountBar from "../components/AccountBar";
import BingoCard from "../components/BingoCard";
import AuthForm from "../components/AuthForm";
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
  const { user, loading: authLoading, configured } = useAuth();
  const [playerId, setPlayerId] = useState<string | null>(store.get);
  const [state, setState] = useState<PlayerState | null>(null);
  const [connError, setConnError] = useState("");
  const [claim, setClaim] = useState<BingoClaim | null>(null);

  useEffect(() => {
    async function autoJoin() {
      if (!user || playerId) return;

      try {
        const displayName = user.email?.split("@")[0] || "Player";
        const { player_id } = await api<{ player_id: string }>("/join", {
          method: "POST",
          body: { name: displayName },
        });

        store.set(player_id);
        setPlayerId(player_id);
        setConnError("");
      } catch (err) {
        setConnError(errorMessage(err));
      }
    }

    autoJoin();
  }, [user, playerId]);

  usePolling(
    async () => {
      try {
        setState(await api<PlayerState>(`/player/${playerId}`));
        setConnError("");
      } catch (e) {
        if (errorStatus(e) === 404) {
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

  if (!configured) {
    return (
      <main className="page center">
        <p className="banner warn">Firebase is not configured. Check your client .env variables.</p>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="page center">
        <p className="muted">Checking authentication session…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page center">
        <AuthForm />
        <ServerStatus />
      </main>
    );
  }

  if (!playerId || !state) {
    return (
      <main className="page center">
        <p className="muted">{connError || "Loading your bingo card…"}</p>
      </main>
    );
  }

  // Action handlers
  async function toggle(index: number) {
    setState((s) => {
      if (!s) return s;
      const marks = new Set(s.marks);
      if (marks.has(index)) marks.delete(index);
      else marks.add(index);
      return { ...s, marks: [...marks] };
    });
    try {
      const { marks } = await api<{ marks: number[] }>(`/player/${playerId}/mark`, {
        method: "POST",
        body: { index },
      });
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

function ServerStatus() {
  const [status, setStatus] = useState("Checking server…");

  useEffect(() => {
    api<{ msg: string; date: string }>("/data")
      .then((d) => setStatus(`Server: ${d.msg} (${d.date})`))
      .catch(() => setStatus("Server: not reachable - is Flask running on port 5001?"));
  }, []);

  return <p className="muted small" style={{ marginTop: "16px", textAlign: "center" }}>{status}</p>;
}