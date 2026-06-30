// Compact three-way theme control (Light / Dark / System). Recognition over
// recall per the UX mandate: three labelled icon buttons in a segmented pill,
// the active one highlighted. Reads/writes the shared theme via useTheme().

import { useTheme } from "./ThemeProvider";
import { SunIcon, MoonIcon, MonitorIcon } from "../icons";
import type { ThemePreference } from "../theme";
import "./ThemeToggle.css";

const OPTIONS: { value: ThemePreference; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "system", label: "System", Icon: MonitorIcon },
];

export function ThemeToggle() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            className={active ? "theme-toggle-btn theme-toggle-btn--active" : "theme-toggle-btn"}
            aria-pressed={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => setPreference(value)}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
