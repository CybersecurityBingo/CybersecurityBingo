const LETTERS = ["B", "I", "N", "G", "O"];

interface Props {
  card: string[];
  marks: number[]; // marked indexes (0-24, 12 = free)
  onToggle?: (index: number) => void;
  winLine?: number[];
  disabled?: boolean;
}

export default function BingoCard({ card, marks, onToggle, winLine = [], disabled = false }: Props) {
  const marked = new Set(marks);
  const winning = new Set(winLine);

  return (
    <div className="card" role="grid" aria-label="Bingo card">
      {LETTERS.map((l) => (
        <div key={l} className="card-letter" aria-hidden="true">
          {l}
        </div>
      ))}
      {card.map((term, i) => {
        const isFree = term === "FREE";
        const classes = [
          "cell",
          marked.has(i) && "marked",
          isFree && "free",
          winning.has(i) && "winning",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={i}
            type="button"
            role="gridcell"
            className={classes}
            aria-pressed={marked.has(i)}
            disabled={disabled || isFree}
            onClick={() => onToggle?.(i)}
          >
            {isFree ? "★ FREE" : term}
          </button>
        );
      })}
    </div>
  );
}
