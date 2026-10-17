import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, errorStatus } from "../api";
import usePolling from "../usePolling";
import QuestionFeed from "../components/QuestionFeed";
import type { AdminState, BankQuestion, CalledQuestion } from "../types";

const TOKEN_KEY = "bingo.adminToken";
const getToken = (): string | null => {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
};
const setToken = (t: string | null) => {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
};

export default function AdminView() {
  const [token, setTok] = useState<string | null>(getToken);
  const [state, setState] = useState<AdminState | null>(null);
  const [error, setError] = useState("");

  const logout = () => {
    setToken(null);
    setTok(null);
    setState(null);
  };

  usePolling(
    async () => {
      try {
        setState(await api<AdminState>("/admin/state", { token }));
        setError("");
      } catch (e) {
        if (errorStatus(e) === 401) logout();
        else setError("Can't reach the server - retrying…");
      }
    },
    2000,
    Boolean(token)
  );

  if (!token) {
    return <AdminLogin onLogin={(t) => { setToken(t); setTok(t); }} />;
  }
  if (!state) {
    return <main className="page center"><p className="muted">{error || "Loading…"}</p></main>;
  }

  const refresh = async () => setState(await api<AdminState>("/admin/state", { token }));

  async function reset() {
    if (!window.confirm("Reset the game? All players and questions will be cleared.")) return;
    await api("/admin/reset", { method: "POST", token });
    refresh();
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <h1>Host console</h1>
          <p className="muted">
            Players join at <code>{window.location.origin}</code> · Game <code>{state.game_id}</code>
          </p>
        </div>
        <div className="row">
          <button className="danger" onClick={reset}>Reset game</button>
          <button onClick={logout}>Log out</button>
        </div>
      </header>

      {error && <p className="banner warn">{error}</p>}

      <div className="layout admin">
        <section className="panel" aria-labelledby="send-h">
          <h2 id="send-h">Send a question</h2>
          <SendQuestion bank={state.bank} token={token} onSent={refresh} />
        </section>

        <section className="panel" aria-labelledby="sent-h">
          <h2 id="sent-h">Questions sent ({state.called.length})</h2>
          <QuestionFeed called={state.called} showAnswers emptyText="Nothing sent yet." />
        </section>

        <section className="panel" aria-labelledby="claims-h">
          <h2 id="claims-h">BINGO claims</h2>
          {state.claims.length === 0 ? (
            <p className="muted">No claims yet.</p>
          ) : (
            <ul className="list">
              {state.claims.map((c, i) => (
                <li key={i} className={c.valid ? "good-text" : "warn-text"}>
                  {c.valid ? "✔ Valid" : "✘ Rejected"} — {c.name}
                  <span className="muted"> · {new Date(c.at * 1000).toLocaleTimeString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="players-h">
          <h2 id="players-h">Players ({state.players.length})</h2>
          {state.players.length === 0 ? (
            <p className="muted">No one has joined yet.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Name</th><th>Marked</th><th>Card ID</th><th>Status</th></tr>
              </thead>
              <tbody>
                {state.players.map((p) => (
                  <tr key={p.checksum}>
                    <td>{p.name}</td>
                    <td>{p.marks}</td>
                    <td><code>{p.checksum}</code></td>
                    <td>{p.won ? "🏆 Winner" : "Playing"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </main>
  );
}

interface SendQuestionProps {
  bank: BankQuestion[];
  token: string;
  onSent: () => void;
}

function SendQuestion({ bank, token, onSent }: SendQuestionProps) {
  const remaining = bank.filter((q) => !q.called);
  const [term, setTerm] = useState("");
  const [question, setQuestion] = useState("");
  const [msg, setMsg] = useState("");

  const remainingKey = remaining.map((q) => q.term).join("|");

  // Keep the selection valid as questions get used up.
  useEffect(() => {
    if (!remaining.some((q) => q.term === term)) {
      const next = remaining[0];
      setTerm(next ? next.term : "");
      setQuestion(next ? next.question : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingKey, term]);

  function choose(t: string) {
    setTerm(t);
    setQuestion(bank.find((q) => q.term === t)?.question || "");
  }

  async function send(body: { term: string; question: string } | { random: true }) {
    setMsg("");
    try {
      const sent = await api<CalledQuestion>("/admin/call", { method: "POST", token, body });
      setMsg(`Sent Q${sent.n} (answer: ${sent.term})`);
      onSent();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  }

  if (!remaining.length) return <p className="muted">Every question has been sent.</p>;

  return (
    <div className="stack">
      <label htmlFor="term">Answer / card square</label>
      <select id="term" value={term} onChange={(e) => choose(e.target.value)}>
        {remaining.map((q) => (
          <option key={q.term} value={q.term}>{q.term}</option>
        ))}
      </select>

      <label htmlFor="question">Question players will see (editable)</label>
      <textarea id="question" rows={3} maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} />

      <div className="row">
        <button className="primary" disabled={!term || !question.trim()} onClick={() => send({ term, question })}>
          Send question
        </button>
        <button onClick={() => send({ random: true })}>Send a random one</button>
      </div>
      <p className="muted small">{remaining.length} of {bank.length} questions left.</p>
      {msg && <p className="banner">{msg}</p>}
    </div>
  );
}

function AdminLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const { token } = await api<{ token: string }>("/admin/login", { method: "POST", body: { password } });
      onLogin(token);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <main className="page center">
      <form className="panel narrow" onSubmit={submit}>
        <h1>Host login</h1>
        <label htmlFor="pw">Admin password</label>
        <input id="pw" type="password" value={password} autoFocus onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="banner warn">{error}</p>}
        <button className="primary" disabled={!password}>Log in</button>
      </form>
    </main>
  );
}
