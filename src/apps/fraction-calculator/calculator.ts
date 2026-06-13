// src/apps/fraction-calculator/calculator.ts
import {
  add,
  div,
  fromInt,
  mul,
  sub,
  toFractionString,
  type Rational,
} from "./fraction";

export type ActiveField = "feet" | "whole" | "num" | "den";
export type Operator = "+" | "-" | "*" | "/";
export type DisplayMode = "fraction" | "decimal";
export type Accuracy = 64 | 32 | 16 | 8;

const OPERATOR_SYMBOLS: Record<Operator, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };

/**
 * `den === null` means the user hasn't started entering a fraction part yet.
 * `den === 0` means the user has advanced into the denominator field but hasn't
 * typed a digit yet — operator/equals treat this as a pending divide-by-zero.
 */
export interface EntryValue {
  feet: number;
  whole: number;
  num: number;
  den: number | null;
}

export interface HistoryEntry {
  expression: string;
  result: Rational;
}

export interface CalcState {
  entry: EntryValue;
  activeField: ActiveField;
  accumulator: Rational | null;
  pendingOp: Operator | null;
  display: DisplayMode;
  unitsMode: boolean;
  accuracy: Accuracy;
  history: HistoryEntry[];
  error: boolean;
}

export type CalcAction =
  | { type: "digit"; value: number }
  | { type: "fieldAdvance" }
  | { type: "backspace" }
  | { type: "operator"; op: Operator }
  | { type: "equals" }
  | { type: "clearEntry" }
  | { type: "allClear" }
  | { type: "toggleDisplay" }
  | { type: "toggleUnits" }
  | { type: "setAccuracy"; value: Accuracy };

const EMPTY_ENTRY: EntryValue = { feet: 0, whole: 0, num: 0, den: null };

export function initialState(): CalcState {
  return {
    entry: { ...EMPTY_ENTRY },
    activeField: "whole",
    accumulator: null,
    pendingOp: null,
    display: "fraction",
    unitsMode: false,
    accuracy: 16,
    history: [],
    error: false,
  };
}

/** Order of fields for field-advance, with "feet" only included in units mode. */
function fieldOrder(unitsMode: boolean): ActiveField[] {
  return unitsMode ? ["feet", "whole", "num", "den"] : ["whole", "num", "den"];
}

/** Convert an EntryValue to a Rational. `den === null` is treated as a whole number (no fraction part). */
function entryToRational(entry: EntryValue, unitsMode: boolean): Rational {
  const denom = entry.den ?? 0;
  if (denom === 0) {
    const wholeInches = unitsMode ? entry.feet * 12 + entry.whole : entry.whole;
    return fromInt(wholeInches);
  }
  const fraction: Rational = { numerator: BigInt(entry.num), denominator: BigInt(denom) };
  const whole = unitsMode ? entry.feet * 12 + entry.whole : entry.whole;
  return add(fromInt(whole), fraction);
}

/** True if the user has advanced into the denominator field but not yet typed a digit (den === 0, distinct from den === null = "no fraction part started"). Operator/equals treat this as a pending divide-by-zero and set error. */
function entryHasZeroDenominator(entry: EntryValue): boolean {
  return entry.den === 0;
}

function applyOp(a: Rational, op: Operator, b: Rational): Rational {
  switch (op) {
    case "+":
      return add(a, b);
    case "-":
      return sub(a, b);
    case "*":
      return mul(a, b);
    case "/":
      return div(a, b);
  }
}

function entryDisplayString(entry: EntryValue, unitsMode: boolean): string {
  const parts: string[] = [];
  if (unitsMode && entry.feet) parts.push(`${entry.feet}'`);
  if (entry.whole || (!parts.length && entry.den === null)) parts.push(`${entry.whole}`);
  if (entry.den !== null) parts.push(`${entry.num}/${entry.den || 1}`);
  return parts.join(" ");
}

export function dispatch(state: CalcState, action: CalcAction): CalcState {
  if (state.error && action.type !== "allClear") return state;

  switch (action.type) {
    case "digit": {
      const entry = { ...state.entry };
      const field = state.activeField;
      if (field === "den") {
        entry.den = (entry.den ?? 0) * 10 + action.value;
      } else {
        entry[field] = entry[field] * 10 + action.value;
      }
      return { ...state, entry };
    }

    case "fieldAdvance": {
      const order = fieldOrder(state.unitsMode);
      const idx = order.indexOf(state.activeField);
      const nextField = order[Math.min(idx + 1, order.length - 1)];
      const entry = { ...state.entry };
      if (nextField === "den" && entry.den === null) entry.den = 0;
      return { ...state, entry, activeField: nextField };
    }

    case "backspace": {
      const order = fieldOrder(state.unitsMode);
      const idx = order.indexOf(state.activeField);
      const entry = { ...state.entry };
      const field = state.activeField;
      const currentValue = field === "den" ? entry.den ?? 0 : entry[field];

      if (currentValue !== 0) {
        if (field === "den") {
          const next = Math.floor((entry.den ?? 0) / 10);
          entry.den = entry.den === 0 ? null : next;
        } else {
          entry[field] = Math.floor(entry[field] / 10);
        }
        return { ...state, entry };
      }

      if (idx === 0) return { ...state, entry };
      const prevField = order[idx - 1];
      if (field === "den") entry.den = null;
      return { ...state, entry, activeField: prevField };
    }

    case "operator": {
      if (entryHasZeroDenominator(state.entry)) return { ...state, error: true };
      const entryValue = entryToRational(state.entry, state.unitsMode);

      try {
        if (state.accumulator !== null && state.pendingOp !== null) {
          const result = applyOp(state.accumulator, state.pendingOp, entryValue);
          return {
            ...state,
            accumulator: result,
            pendingOp: action.op,
            entry: { ...EMPTY_ENTRY },
            activeField: fieldOrder(state.unitsMode)[0],
          };
        }
        return {
          ...state,
          accumulator: entryValue,
          pendingOp: action.op,
          entry: { ...EMPTY_ENTRY },
          activeField: fieldOrder(state.unitsMode)[0],
        };
      } catch {
        return { ...state, error: true };
      }
    }

    case "equals": {
      if (entryHasZeroDenominator(state.entry)) return { ...state, error: true };
      if (state.accumulator === null || state.pendingOp === null) return state;
      const entryValue = entryToRational(state.entry, state.unitsMode);

      try {
        const result = applyOp(state.accumulator, state.pendingOp, entryValue);
        const expression =
          `${toFractionString(state.accumulator)} ${OPERATOR_SYMBOLS[state.pendingOp]} ` +
          entryDisplayString(state.entry, state.unitsMode);
        return {
          ...state,
          accumulator: result,
          pendingOp: null,
          entry: { ...EMPTY_ENTRY },
          activeField: fieldOrder(state.unitsMode)[0],
          history: [...state.history, { expression, result }],
        };
      } catch {
        return { ...state, error: true };
      }
    }

    case "clearEntry":
      return {
        ...state,
        entry: { ...EMPTY_ENTRY },
        activeField: fieldOrder(state.unitsMode)[0],
      };

    case "allClear":
      return {
        ...state,
        entry: { ...EMPTY_ENTRY },
        activeField: fieldOrder(state.unitsMode)[0],
        accumulator: null,
        pendingOp: null,
        error: false,
      };

    case "toggleDisplay":
      return { ...state, display: state.display === "fraction" ? "decimal" : "fraction" };

    case "toggleUnits": {
      const unitsMode = !state.unitsMode;
      return {
        ...state,
        unitsMode,
        entry: { ...EMPTY_ENTRY },
        activeField: fieldOrder(unitsMode)[0],
      };
    }

    case "setAccuracy":
      return { ...state, accuracy: action.value };

    default:
      return state;
  }
}
