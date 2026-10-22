import { useState, type FormEvent } from "react";
import { api, errorMessage, errorStatus } from "../api";
import usePolling from "../usePolling";
import { useAuth } from "../AuthContext";
import AccountBar from "../components/AccountBar";
import AuthForm from "../components/AuthForm";
import BingoCard from "../components/BingoCard";
import QuestionFeed from "../components/QuestionFeed";
import type { BingoClaim, PlayerState } from "../types";

export default function PlayerView() {
  const { user, loading } = useAuth();

  if (loading) {
    return <main className="page center"><p className="muted">Checking sign-in…</p></main>;
  }

  if (!user) {
    return (
      <main className="page center">
        <AuthForm />
      </main>
    );
  }

  // Keyed by account: switching users starts fresh, so one person's card never shows for the next.
  return <PlayerGame key={user.uid} />;
}

function PlayerGame() {
  // undefined = not loaded yet, null = no card in this game yet
  const [state, setState] = useState<PlayerState | null | undefined>(undefined);
  const [connError, setConnError] = useState("");
  const [claim, setClaim] = useState<BingoClaim | null>(null);

  async function refresh() {
    try {
      setState(await api<PlayerState>("/player"));
      setConnError("");
    } catch (e) {
      if (errorStatus(e) === 404) {
        // Not joined yet, or the host reset the game.
        setState(null);
        setClaim(null);
      } else {
        setConnError(errorMessage(e));
      }
    }
  }

  usePolling(refresh, 2000);

  if (state === undefined) {
    return (
      <main className="page center">
        <div className="panel narrow">
          <p className={connError ? "banner warn" : "muted"}>{connError || "Loading your card…"}</p>
          <AccountBar />
        </div>
      </main>
    );
  }

  if (state === null) {
    return <JoinForm onJoined={refresh} />;
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
      const { marks } = await api<{ marks: number[] }>("/player/mark", { method: "POST", body: { index } });
      setState((s) => (s ? { ...s, marks } : s));
    } catch (e) {
      setConnError(errorMessage(e));
    }
  }

  async function callBingo() {
    try {
      setClaim(await api<BingoClaim>("/player/bingo", { method: "POST" }));
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
            <p className="banner good">You have BINGO! Show this code to the host: <code>{state.card_id}</code></p>
          ) : (
            <button className="primary big" onClick={callBingo}>BINGO!</button>
          )}
          {claim && !claim.valid && <p className="banner warn">{claim.message}</p>}
          <p className="muted small">Card ID: <code>{state.card_id}</code></p>
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

function JoinForm({ onJoined }: { onJoined: () => Promise<void> }) {
  const { user } = useAuth();
  const defaultName = (user?.displayName || user?.email?.split("@")[0] || "").slice(0, 30);
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/join", { method: "POST", body: { name } });
      await onJoined();
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
      </form>
    </main>
  );
}
