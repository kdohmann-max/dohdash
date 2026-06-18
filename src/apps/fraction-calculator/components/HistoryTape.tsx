// src/apps/fraction-calculator/components/HistoryTape.tsx
import { useEffect, useRef } from "react";
import {
  roundToFraction,
  toDecimalString,
  toFeetAndInches,
  toFeetInchesString,
  toFractionString,
} from "../fraction";
import type { CalcState, HistoryEntry } from "../calculator";
import "./HistoryTape.css";

function formatResult(entry: HistoryEntry, state: CalcState): string {
  if (state.unitsMode === "ftIn") return toFeetInchesString(entry.result, BigInt(state.accuracy));
  if (state.unitsMode === "ftInSeparate") {
    const { feet, inches } = toFeetAndInches(entry.result, BigInt(state.accuracy));
    return `${feet} ft ${inches} in`;
  }
  if (state.display === "decimal") return toDecimalString(entry.result);
  return toFractionString(roundToFraction(entry.result, BigInt(state.accuracy)));
}

export function HistoryTape({
  state,
  onSelect,
  onClear,
}: {
  state: CalcState;
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.history.length]);

  if (state.history.length === 0) {
    return <div className="fc-history fc-history--empty" ref={ref} />;
  }

  return (
    <div className="fc-history-wrap">
      <button type="button" className="fc-history-clear" onClick={onClear}>
        Clear history
      </button>
      <div className="fc-history" ref={ref}>
        {state.history.map((entry, i) => (
          <button
            key={i}
            type="button"
            className="fc-history-item"
            onClick={() => onSelect(entry)}
          >
            <span className="fc-history-expr">{entry.expression}</span>
            <span className="fc-history-result">= {formatResult(entry, state)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
