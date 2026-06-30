// Live theme state for the whole app. Mirrors the CompanyInfoContext pattern.
// Holds the user's preference (system/light/dark), resolves it to a concrete
// light/dark, writes the <html data-theme> attribute, and persists the choice.
// When the preference is "system" it live-updates as the OS setting flips.
//
// Any app (current or future) reads/sets the theme via useTheme() — no app needs
// to manage theme itself; using the design tokens is enough for colors to swap.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  applyResolvedTheme,
  readStoredPreference,
  resolveTheme,
  storePreference,
  watchSystemTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "../theme";

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolveTheme(readStoredPreference()));

  // Apply + persist whenever the preference changes.
  useEffect(() => {
    const next = resolveTheme(preference);
    setResolved(next);
    applyResolvedTheme(next);
    storePreference(preference);
  }, [preference]);

  // While on "system", track OS changes and re-resolve live (no reload).
  useEffect(() => {
    if (preference !== "system") return;
    return watchSystemTheme(() => {
      const next = resolveTheme("system");
      setResolved(next);
      applyResolvedTheme(next);
    });
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference: setPreferenceState }),
    [preference, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
