import { useEffect, useReducer } from "react";
import {
  dispatch as calcDispatch,
  initialState,
  type Accuracy,
  type CalcState,
  type UnitsMode,
} from "./calculator";
import { Display } from "./components/Display";
import { HistoryTape } from "./components/HistoryTape";
import { ModeControls } from "./components/ModeControls";
import { Keypad } from "./components/Keypad";
import "./FractionCalculatorApp.css";

const STORAGE_KEY = "dohdash-fraction-calculator-prefs";

interface StoredPrefs {
  display: CalcState["display"];
  unitsMode: UnitsMode;
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
    unitsMode: prefs.unitsMode ?? "plain",
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
