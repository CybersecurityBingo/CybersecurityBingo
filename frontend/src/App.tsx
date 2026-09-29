import { useState, useEffect } from "react";
import "./App.css";

interface DataResponse {
  msg: string;
  date: string;
}

function App() {
  const [data, setData] = useState({ msg: "", date: "" });

  useEffect(() => {
    fetch("/api/data")
      .then((res) => res.json() as Promise<DataResponse>)
      .then((json) => setData({ msg: json.msg, date: json.date}))
      .catch((err) => console.error("Fetch failed:", err));
  }, []);

  return (
    <div className="App">
      <header className="AppHeader">
        <h1>Bingo Game (Not really yet lol)</h1>
        <p>{data.msg}</p>
        <p>{data.date}</p>
      </header>
    </div>
  );
}

export default App;