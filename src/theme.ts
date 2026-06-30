// Light/dark theme core — framework-agnostic helpers (no React) so the exact
// same logic runs in the anti-flash boot script (index.html) and inside the
// React ThemeProvider (src/components/ThemeProvider.tsx).
//
// The user's *preference* is one of "system" | "light" | "dark" and is stored
// in localStorage. It resolves to a concrete "light" | "dark" that is written
// as a `data-theme` attribute on <html>; CSS variables in index.css key off it.

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "dohdash-theme";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

// Reads the saved preference. Anything unrecognized (incl. nothing saved) means
// "follow the OS". Older builds stored "light"/"dark" directly — still valid as
// a pinned preference, so no migration is needed.
export function readStoredPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // localStorage can throw (private mode, disabled) — fall through to default.
  }
  return "system";
}

export function storePreference(pref: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Non-fatal: the choice just won't persist across reloads.
  }
}

export function prefersDark(): boolean {
  return window.matchMedia?.(MEDIA_QUERY).matches ?? false;
}

// Preference + current OS setting → the concrete theme to paint.
export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  if (pref === "light" || pref === "dark") return pref;
  return prefersDark() ? "dark" : "light";
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  document.documentElement.dataset.theme = resolved;
}

// Subscribe to OS light/dark changes; returns an unsubscribe fn. Used by the
// provider so a "system" preference live-updates when the OS flips.
export function watchSystemTheme(onChange: () => void): () => void {
  const mql = window.matchMedia?.(MEDIA_QUERY);
  if (!mql) return () => {};
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}
