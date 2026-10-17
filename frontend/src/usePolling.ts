import { useEffect, useRef } from "react";

// Calls `fn` immediately and then every `ms` milliseconds while `enabled`.
// Polling keeps things simple; swap for websockets (Flask-SocketIO) later.
export default function usePolling(fn: () => void | Promise<void>, ms: number, enabled = true) {
  const saved = useRef(fn);

  useEffect(() => {
    saved.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const tick = () => {
      if (alive) void saved.current();
    };
    tick();
    const id = setInterval(tick, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ms, enabled]);
}
