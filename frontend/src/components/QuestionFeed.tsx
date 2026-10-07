import type { CalledQuestion } from "../types";

interface Props {
  called: CalledQuestion[];
  showAnswers?: boolean; // admin view only
  emptyText?: string;
}

// List of questions the admin has sent, newest first.
export default function QuestionFeed({ called, showAnswers = false, emptyText }: Props) {
  if (!called.length) {
    return <p className="muted">{emptyText || "No questions yet."}</p>;
  }
  const newestFirst = [...called].reverse();

  return (
    <ol className="feed" reversed>
      {newestFirst.map((q, idx) => (
        <li key={q.n} className={idx === 0 ? "feed-item latest" : "feed-item"}>
          <div className="feed-meta">
            <span className="feed-num">Q{q.n}</span>
            {idx === 0 && <span className="pill">Latest</span>}
            <span className="muted">{new Date(q.at * 1000).toLocaleTimeString()}</span>
          </div>
          <p className="feed-question">{q.question}</p>
          {showAnswers && <p className="feed-answer">Answer: {q.term}</p>}
        </li>
      ))}
    </ol>
  );
}
