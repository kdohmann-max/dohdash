// src/apps/fraction-calculator/components/ModeControls.tsx
import type { Accuracy, CalcState } from "../calculator";
import "./ModeControls.css";

const ACCURACY_OPTIONS: Accuracy[] = [8, 16, 32, 64];

export function ModeControls({
  state,
  onToggleDisplay,
  onToggleUnits,
  onSetAccuracy,
}: {
  state: CalcState;
  onToggleDisplay: () => void;
  onToggleUnits: () => void;
  onSetAccuracy: (value: Accuracy) => void;
}) {
  return (
    <div className="fc-mode-controls">
      <div className="fc-mode-toggles">
        <button
          type="button"
          className="fc-toggle"
          aria-pressed={state.display === "decimal"}
          onClick={onToggleDisplay}
        >
          {state.display === "fraction" ? "Fraction" : "Decimal"}
        </button>
        <button
          type="button"
          className="fc-toggle"
          aria-pressed={state.unitsMode}
          onClick={onToggleUnits}
        >
          {state.unitsMode ? "ft/in" : "Plain"}
        </button>
      </div>

      {state.display === "fraction" && (
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
