// src/apps/fraction-calculator/components/ModeControls.tsx
import type { Accuracy, CalcState, DisplayMode, UnitsMode } from "../calculator";
import "./ModeControls.css";

const ACCURACY_OPTIONS: Accuracy[] = [8, 16, 32, 64];

const DISPLAY_OPTIONS: { value: DisplayMode; label: string }[] = [
  { value: "fraction", label: "Fraction" },
  { value: "decimal", label: "Decimal" },
];

const UNITS_OPTIONS: { value: UnitsMode; label: string }[] = [
  { value: "plain", label: "Plain" },
  { value: "ftIn", label: "Ft-In" },
  { value: "ftInSeparate", label: "Ft+In" },
];

export function ModeControls({
  state,
  onSetDisplay,
  onSetUnitsMode,
  onSetAccuracy,
}: {
  state: CalcState;
  onSetDisplay: (value: DisplayMode) => void;
  onSetUnitsMode: (value: UnitsMode) => void;
  onSetAccuracy: (value: Accuracy) => void;
}) {
  return (
    <div className="fc-mode-controls">
      <div className="fc-mode-toggles">
        <div className="fc-segmented" role="group" aria-label="Display mode">
          {DISPLAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="fc-segment"
              aria-pressed={state.display === opt.value}
              onClick={() => onSetDisplay(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="fc-segmented" role="group" aria-label="Units mode">
          {UNITS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className="fc-segment"
              aria-pressed={state.unitsMode === opt.value}
              onClick={() => onSetUnitsMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {(state.display === "fraction" || state.unitsMode !== "plain") && (
        <div className="fc-accuracy">
          {ACCURACY_OPTIONS.map((acc) => (
            <button
              key={acc}
              type="button"
              className="fc-accuracy-chip"
              aria-pressed={state.accuracy === acc}
              onClick={() => onSetAccuracy(acc)}
            >
              1/{acc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
