// Light/dark theme helpers
// Light is default
// User choice is remembered in browser.

export type Theme = "light" | "dark";

const STORAGE_KEY = "bingo.theme";

export function getSavedTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light"; // storage blocked
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage blocked: theme continues to be applies for this visit */
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
