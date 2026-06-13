// src/apps/fraction-calculator/components/Keypad.tsx
import type { CalcAction } from "../calculator";
import "./Keypad.css";

export function Keypad({ dispatch }: { dispatch: (action: CalcAction) => void }) {
  return (
    <div className="fc-keypad">
      <button type="button" className="fc-key fc-key--fn" onClick={() => dispatch({ type: "allClear" })}>
        AC
      </button>
      <button type="button" className="fc-key fc-key--fn" onClick={() => dispatch({ type: "clearEntry" })}>
        C
      </button>
      <button type="button" className="fc-key fc-key--fn" onClick={() => dispatch({ type: "backspace" })}>
        ⌫
      </button>
      <button type="button" className="fc-key fc-key--op" onClick={() => dispatch({ type: "operator", op: "/" })}>
        ÷
      </button>

      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 7 })}>7</button>
      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 8 })}>8</button>
      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 9 })}>9</button>
      <button type="button" className="fc-key fc-key--op" onClick={() => dispatch({ type: "operator", op: "*" })}>
        ×
      </button>

      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 4 })}>4</button>
      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 5 })}>5</button>
      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 6 })}>6</button>
      <button type="button" className="fc-key fc-key--op" onClick={() => dispatch({ type: "operator", op: "-" })}>
        −
      </button>

      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 1 })}>1</button>
      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 2 })}>2</button>
      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 3 })}>3</button>
      <button type="button" className="fc-key fc-key--op" onClick={() => dispatch({ type: "operator", op: "+" })}>
        +
      </button>

      <button type="button" className="fc-key fc-key--fn" onClick={() => dispatch({ type: "fieldAdvance" })}>
        ⁄
      </button>
      <button type="button" className="fc-key" onClick={() => dispatch({ type: "digit", value: 0 })}>0</button>
      <button
        type="button"
        className="fc-key fc-key--equals"
        onClick={() => dispatch({ type: "equals" })}
      >
        =
      </button>
    </div>
  );
}
