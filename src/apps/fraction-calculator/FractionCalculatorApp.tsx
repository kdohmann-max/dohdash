import { useEffect, useReducer } from "react";
import { dispatch as calcDispatch, initialState, type Accuracy, type CalcState } from "./calculator";
import { Display } from "./components/Display";
import { HistoryTape } from "./components/HistoryTape";
import { ModeControls } from "./components/ModeControls";
import { Keypad } from "./components/Keypad";
import "./FractionCalculatorApp.css";

const STORAGE_KEY = "dohdash-fraction-calculator-prefs";

interface StoredPrefs {
  display: CalcState["display"];
  unitsMode: boolean;
  accuracy: Accuracy;
}

function loadPrefs(): Partial<StoredPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<StoredPrefs>) : {};
  } catch {
    return {};
  }
}

function init(): CalcState {
  const prefs = loadPrefs();
  return {
    ...initialState(),
    display: prefs.display ?? "fraction",
    unitsMode: prefs.unitsMode ?? false,
    accuracy: prefs.accuracy ?? 16,
  };
}

export function FractionCalculatorApp() {
  const [state, dispatch] = useReducer(calcDispatch, undefined, init);

  useEffect(() => {
    const prefs: StoredPrefs = {
      display: state.display,
      unitsMode: state.unitsMode,
      accuracy: state.accuracy,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  }, [state.display, state.unitsMode, state.accuracy]);

  return (
    <div className="fraction-calculator">
      <HistoryTape
        state={state}
        onSelect={(entry) => dispatch({ type: "recallResult", value: entry.result })}
      />
      <Display state={state} />
      <ModeControls
        state={state}
        onToggleDisplay={() => dispatch({ type: "toggleDisplay" })}
        onToggleUnits={() => dispatch({ type: "toggleUnits" })}
        onSetAccuracy={(value) => dispatch({ type: "setAccuracy", value })}
      />
      <Keypad dispatch={dispatch} />
    </div>
  );
}
