import { useEffect, useState } from "react";
import { applyTheme, getSavedTheme, saveTheme } from "./theme.ts";
import type { Theme } from "./theme.ts";

// Button that switches between light and dark mode
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getSavedTheme);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  const next: Theme = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      aria-pressed={theme === "dark"}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {theme === "light" ? "☾" : "☀"}
      </span>
      {theme === "light" ? "Dark mode" : "Light mode"}
    </button>
  );
}
