import { useEffect, useReducer } from "react";
import {
  dispatch as calcDispatch,
  initialState,
  type Accuracy,
  type CalcState,
  type HistoryEntry,
  type UnitsMode,
} from "./calculator";
import type { Rational } from "./fraction";
import { Display } from "./components/Display";
import { HistoryTape } from "./components/HistoryTape";
import { ModeControls } from "./components/ModeControls";
import { Keypad } from "./components/Keypad";
import "./FractionCalculatorApp.css";

const STORAGE_KEY = "dohdash-fraction-calculator-prefs";
const HISTORY_KEY = "dohdash-fraction-calculator-history";
const HISTORY_CAP = 50;

interface StoredPrefs {
  display: CalcState["display"];
  unitsMode: UnitsMode;
  accuracy: Accuracy;
}

// History results are Rationals (bigint fields), which JSON can't serialize
// directly — store numerator/denominator as decimal strings and rehydrate.
interface StoredHistoryEntry {
  expression: string;
  numerator: string;
  denominator: string;
}

function loadPrefs(): Partial<StoredPrefs> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<StoredPrefs>) : {};
  } catch {
    return {};
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredHistoryEntry[];
    return stored.map((e) => ({
      expression: e.expression,
      result: { numerator: BigInt(e.numerator), denominator: BigInt(e.denominator) } as Rational,
    }));
  } catch {
    return [];
  }
}

function saveHistory(history: HistoryEntry[]): void {
  try {
    const stored: StoredHistoryEntry[] = history.slice(-HISTORY_CAP).map((e) => ({
      expression: e.expression,
      numerator: e.result.numerator.toString(),
      denominator: e.result.denominator.toString(),
    }));
    localStorage.setItem(HISTORY_KEY, JSON.stringify(stored));
  } catch {
    // Out of quota or unavailable — history is a convenience, never block the calc.
  }
}

function init(): CalcState {
  const prefs = loadPrefs();
  return {
    ...initialState(),
    display: prefs.display ?? "fraction",
    unitsMode: prefs.unitsMode ?? "plain",
    accuracy: prefs.accuracy ?? 16,
    history: loadHistory(),
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

  useEffect(() => {
    saveHistory(state.history);
  }, [state.history]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const { key } = e;
      if (key >= "0" && key <= "9") {
        e.preventDefault();
        dispatch({ type: "digit", value: Number(key) });
        return;
      }
      switch (key) {
        case "+":
          e.preventDefault();
          dispatch({ type: "operator", op: "+" });
          break;
        case "-":
          e.preventDefault();
          dispatch({ type: "operator", op: "-" });
          break;
        case "*":
          e.preventDefault();
          dispatch({ type: "operator", op: "*" });
          break;
        case "/":
          e.preventDefault();
          dispatch({ type: "operator", op: "/" });
          break;
        case "Enter":
        case "=":
          e.preventDefault();
          dispatch({ type: "equals" });
          break;
        case "Backspace":
          e.preventDefault();
          dispatch({ type: "backspace" });
          break;
        case "Delete":
          e.preventDefault();
          dispatch({ type: "clearEntry" });
          break;
        case "Escape":
          e.preventDefault();
          dispatch({ type: "allClear" });
          break;
        case ".":
          e.preventDefault();
          dispatch({ type: "fieldAdvance" });
          break;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch]);

  return (
    <div className="fraction-calculator">
      <HistoryTape
        state={state}
        onSelect={(entry) => dispatch({ type: "recallResult", value: entry.result })}
        onClear={() => {
          if (window.confirm("Clear all calculation history? This can't be undone.")) {
            dispatch({ type: "clearHistory" });
          }
        }}
      />
      <Display state={state} />
      <ModeControls
        state={state}
        onSetDisplay={(value) => dispatch({ type: "setDisplay", value })}
        onSetUnitsMode={(value) => dispatch({ type: "setUnitsMode", value })}
        onSetAccuracy={(value) => dispatch({ type: "setAccuracy", value })}
      />
      <Keypad dispatch={dispatch} />
    </div>
  );
}
