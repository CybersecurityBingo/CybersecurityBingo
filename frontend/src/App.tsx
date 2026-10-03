import { useState, useEffect } from "react";
import "./App.css";
import { useAuth } from "./AuthContext";
import { JankLoginButton, JankSignupButton } from "./JankButtons";

interface DataResponse {
  msg: string;
  date: string;
}

function App() {
  const { user, loading } = useAuth();
  const [data, setData] = useState({ msg: "", date: "" });

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/data`)
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
        <p>{loading ? "Loading..." : user ? `Signed in as ${user.email}` : "Not signed in"}</p>
        <JankLoginButton />
        <br />
        <JankSignupButton />
      </header>
    </div>
  );
}

export default App;