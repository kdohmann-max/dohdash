// src/apps/fraction-calculator/components/Display.tsx
import {
  roundToFraction,
  toDecimalString,
  toFeetAndInches,
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
  const hasFeet = unitsMode !== "plain";
  const parts: string[] = [];
  if (hasFeet && entry.feet) parts.push(`${entry.feet}'`);
  if (entry.whole || entry.den === null || (hasFeet && entry.feet === 0 && entry.whole === 0)) {
    if (!(hasFeet && entry.feet > 0 && entry.whole === 0 && entry.den !== null)) {
      parts.push(`${entry.whole}`);
    }
  }
  if (entry.den !== null) parts.push(`${entry.num}/${entry.den}`);
  const joined = parts.join(" ");
  return hasFeet ? `${joined}"` : joined || "0";
}

function formatValue(value: Rational, state: CalcState): string {
  if (state.unitsMode === "ftIn") return toFeetInchesString(value, BigInt(state.accuracy));
  if (state.unitsMode === "ftInSeparate") {
    const { feet, inches } = toFeetAndInches(value, BigInt(state.accuracy));
    return `${feet} ft ${inches} in`;
  }
  if (state.display === "decimal") return toDecimalString(value);
  return toFractionString(roundToFraction(value, BigInt(state.accuracy)));
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

  const lastTwoResults = state.history.slice(-2);

  return (
    <div className="fc-display">
      {lastTwoResults.length > 0 && (
        <div className="fc-display-history">
          {lastTwoResults.map((entry, i) => (
            <div key={i} className="fc-display-history-item">
              <span className="fc-display-history-result">
                {formatValue(entry.result, state)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="fc-display-pending">{pending}</div>
      <div className="fc-display-current">{formatEntry(state)}</div>
    </div>
  );
}
