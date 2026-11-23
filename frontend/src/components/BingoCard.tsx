const LETTERS = ["B", "I", "N", "G", "O"];

type Props = {
  card: string[];
  marks: number[];               // marked indexes (0-24, 12 = FREE)
  onToggle?: (index: number) => void;
  winLine?: number[];
  disabled?: boolean;
  freeSquares?: number[];        // CTF: squares stamped free with a side quest
  picking?: boolean;             // CTF: player is choosing a square to stamp
};

// 5x5 bingo card.
export default function BingoCard({
  card,
  marks,
  onToggle,
  winLine = [],
  disabled = false,
  freeSquares = [],
  picking = false,
}: Props) {
  const marked = new Set(marks);
  const winning = new Set(winLine);
  const ctfFree = new Set(freeSquares);

  return (
    <div
      className={picking ? "card picking" : "card"}
      role="grid"
      aria-label={picking ? "Bingo card: pick a square to make free" : "Bingo card"}
    >
      {LETTERS.map((l) => (
        <div key={l} className="card-letter" aria-hidden="true">
          {l}
        </div>
      ))}
      {card.map((term, i) => {
        const isFree = term === "FREE";
        const isCtf = ctfFree.has(i);
        const classes = [
          "cell",
          marked.has(i) && "marked",
          isFree && "free",
          isCtf && "ctf-free",
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
            aria-label={isCtf ? `${term} (free square from a side quest)` : undefined}
            disabled={disabled || isFree || isCtf}
            onClick={() => onToggle?.(i)}
          >
            {isFree ? "★ FREE" : term}
          </button>
        );
      })}
    </div>
  );
}
