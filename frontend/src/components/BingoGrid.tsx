import { useEffect, useState } from "react";

function BingoGrid() {
  const [squares, setSquares] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/squares`)
      .then((res) => {
        if (!res.ok) {
          throw new Error("Failed to fetch bingo squares");
        }
        return res.json();
      })
      .then((data: string[]) => {
        setSquares(data);
      })
      .catch((err) => {
        console.error("Failed to fetch squares:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p>Loading bingo board...</p>;
  }

  return (
    <div className="bingo-grid">
      {squares.map((square, index) => (
        <div className="bingo-square" key={index}>
          {square}
        </div>
      ))}
    </div>
  );
}

export default BingoGrid;
