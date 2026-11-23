import { useId, useState, type FormEvent } from "react";
import type { CtfState, SideQuests } from "../ctf";

type Props = {
  ctf: CtfState | undefined;
  won: boolean;
  quests: SideQuests;
};

// The Side quests panel: flag entry box, free-square button, challenge list.
export default function FlagEntry({ ctf, won, quests }: Props) {
  const [flag, setFlag] = useState("");
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const headingId = useId();
  const inputId = useId();
  const msgId = useId();

  if (!ctf) return null;
  // Exploits off and nothing earned: keep the page uncluttered.
  if (!ctf.enabled && ctf.credits === 0 && !ctf.challenges.some((c) => c.solved)) return null;

  const { picking, setPicking, feedback, setFeedback, redeem } = quests;
  const solvedCount = ctf.challenges.filter((c) => c.solved).length;
  const fieldState = busy ? "busy" : feedback?.kind ?? "idle";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = flag.trim();
    if (!value || busy) return;
    setBusy(true);
    const result = await redeem(value);
    setBusy(false);
    if (result) setFlag("");
    else setShaking(true);
  }

  return (
    <section className="panel ctf" aria-labelledby={headingId}>
      <div className="ctf-head">
        <h2 id={headingId}>Side quests</h2>
        <span className="ctf-credits" data-ready={ctf.credits > 0 || undefined}>
          <span aria-hidden="true">⚑</span> {ctf.credits} free{" "}
          {ctf.credits === 1 ? "square" : "squares"} ready
        </span>
      </div>

      {ctf.enabled ? (
        <>
          <p className="muted small">
            Find the flags hidden on this site. Each one you enter earns a free square
            (up to {ctf.max_free}). Flags are unique to you, so sharing won't help.
            Only the pages in the hints below are part of the game.
          </p>

          <form className="flag-form" onSubmit={submit} noValidate>
            <label htmlFor={inputId}>Enter a flag</label>
            <div
              className={shaking ? "flag-field is-shaking" : "flag-field"}
              data-state={fieldState}
              onAnimationEnd={() => setShaking(false)}
            >
              <span className="flag-field-icon" aria-hidden="true">⚑</span>
              <input
                id={inputId}
                className="flag-input"
                value={flag}
                onChange={(e) => {
                  setFlag(e.target.value);
                  if (feedback?.kind === "error") setFeedback(null);
                }}
                placeholder="WHB{xxxxx-xxxxx-xxxxx-xxxxx}"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={64}
                aria-invalid={feedback?.kind === "error"}
                aria-describedby={msgId}
              />
              <button type="submit" className="flag-submit" disabled={busy || !flag.trim()}>
                {busy ? "Checking…" : "Submit"}
              </button>
            </div>
            <p id={msgId} className="flag-feedback" data-kind={feedback?.kind} role="status" aria-live="polite">
              {feedback && (
                <>
                  <span aria-hidden="true">{feedback.kind === "success" ? "✓ " : "✕ "}</span>
                  {feedback.text}
                </>
              )}
            </p>
          </form>
        </>
      ) : (
        <p className="banner">
          Side quests are paused by the host. Free squares you've already earned still work.
        </p>
      )}

      {ctf.credits > 0 && !won && (
        <div className="ctf-spend" data-picking={picking || undefined}>
          {picking ? (
            <>
              <p>
                <strong>Pick a square.</strong> Tap any square on your card to make it free.
              </p>
              <button type="button" onClick={() => setPicking(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="primary" onClick={() => setPicking(true)}>
              Use a free square
            </button>
          )}
        </div>
      )}

      {ctf.enabled && (
        <>
          <ul className="ctf-list">
            {ctf.challenges.map((c) => (
              <li key={c.id} className={c.solved ? "ctf-item solved" : "ctf-item"}>
                <details>
                  <summary>
                    <span className="ctf-check" aria-hidden="true">{c.solved ? "✓" : ""}</span>
                    <span className="ctf-title">{c.title}</span>
                    {c.solved && <span className="sr-only"> (solved)</span>}
                  </summary>
                  <p className="muted small">{c.hint}</p>
                </details>
              </li>
            ))}
          </ul>
          <p className="muted small ctf-progress">
            {solvedCount} of {ctf.challenges.length} solved
          </p>
        </>
      )}
    </section>
  );
}
