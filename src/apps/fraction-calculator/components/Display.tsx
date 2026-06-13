// src/apps/fraction-calculator/components/Display.tsx
import {
  toDecimalString,
  toFeetInchesString,
  toFractionString,
  type Rational,
} from "../fraction";
import type { CalcState } from "../calculator";
import "./Display.css";

const OP_SYMBOL: Record<string, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

function formatEntry(state: CalcState): string {
  const { entry, unitsMode } = state;
  const parts: string[] = [];
  if (unitsMode && entry.feet) parts.push(`${entry.feet}'`);
  if (entry.whole || entry.den === null || (unitsMode && entry.feet === 0 && entry.whole === 0)) {
    if (!(unitsMode && entry.feet > 0 && entry.whole === 0 && entry.den !== null)) {
      parts.push(`${entry.whole}`);
    }
  }
  if (entry.den !== null) parts.push(`${entry.num}/${entry.den}`);
  const joined = parts.join(" ");
  return unitsMode ? `${joined}"` : joined || "0";
}

function formatValue(value: Rational, state: CalcState): string {
  if (state.unitsMode) return toFeetInchesString(value, BigInt(state.accuracy));
  if (state.display === "decimal") return toDecimalString(value);
  return toFractionString(value);
}

export function Display({ state }: { state: CalcState }) {
  if (state.error) {
    return (
      <div className="fc-display">
        <div className="fc-display-pending">Error</div>
        <div className="fc-display-current fc-display-current--error">Divide by zero</div>
      </div>
    );
  }

  const pending =
    state.accumulator !== null && state.pendingOp !== null
      ? `${formatValue(state.accumulator, state)} ${OP_SYMBOL[state.pendingOp]}`
      : "";

  return (
    <div className="fc-display">
      <div className="fc-display-pending">{pending}</div>
      <div className="fc-display-current">{formatEntry(state)}</div>
    </div>
  );
}
