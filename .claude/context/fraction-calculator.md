# Fraction Calculator — Context

App id `fraction-calculator`; displayed as "Fraction Calculator" via `CompanyInfo.md` `appNames`.

## Entry point & state machine

`src/apps/fraction-calculator/FractionCalculatorApp.tsx` — single reducer-driven state machine. No global state; plain `useReducer`.

```ts
interface CalcState {
  entry: EntryValue;           // current number being entered (feet, whole, numerator, denominator)
  activeField: ActiveField;    // "feet" | "whole" | "num" | "den" — which field receives digits
  accumulator: Rational | null;  // left operand of a pending operation
  pendingOp: Operator | null;  // "+", "-", "*", "/" — waiting for right operand
  display: DisplayMode;        // "fraction" | "decimal" — output format
  unitsMode: UnitsMode;        // "plain" | "ftIn" | "ftInSeparate" — feet/inches support
  accuracy: Accuracy;          // 64 | 32 | 16 | 8 — denominator limit for rounding
  history: HistoryEntry[];     // calculation history for recall
  error: boolean;              // divide-by-zero or other failure
}
```

- **Field advancement:** `.` key (or button) cycles through the entry fields in order (`fieldOrder()` changes based on `unitsMode`). Advancing into `den` for the first time sets it to `0` (signaling an incomplete denominator, not "no fraction").
- **Zero denominator:** `den === null` means no fraction part started; `den === 0` means user advanced into the denominator but hasn't typed yet — treated as pending divide-by-zero and sets `error: true` on operator/equals.

## Components

| Component | File | Purpose |
|-----------|------|---------|
| `Display` | `components/Display.tsx` | Shows pending operation + current entry, or "Error / Divide by zero" |
| `HistoryTape` | `components/HistoryTape.tsx` | Scrollable calculation history; click to recall a result |
| `ModeControls` | `components/ModeControls.tsx` | Display mode (fraction/decimal), units mode (plain/ftIn/ftInSeparate), accuracy (64/32/16/8) toggles |
| `Keypad` | `components/Keypad.tsx` | Digit buttons + operators + equals/backspace/clear buttons |

## Rational arithmetic

`src/apps/fraction-calculator/fraction.ts` — pure functions on `Rational = { numerator: bigint; denominator: bigint }`.

| Function | What it does |
|----------|--------------|
| `reduce()` | GCD-based reduction to lowest terms; ensures `denominator > 0` |
| `add()`, `sub()`, `mul()`, `div()` | Rational arithmetic with automatic reduction |
| `roundToFraction()` | Round to nearest 1/N (e.g., 1/16) using banker's rounding |
| `toFractionString()` | Format: "3 1/2", "1/2", "-3 1/2", or "3" for whole |
| `toDecimalString()` | Decimal up to 6 places, trimmed of trailing zeros |
| `toFeetInchesString()` | Format as "3' 6 1/2\"" (combined feet/inches with fraction) |
| `toFeetAndInches()` | Separate feet (bigint) and inches (string) for `ftInSeparate` mode |

## Unit modes

- **`plain`:** Standard fractions (whole + num/den). Field order: `["whole", "num", "den"]`.
- **`ftIn`:** Feet/inches as a single value (internally stored in inches). Entry separates feet and inches; output combines them ("3' 6 1/2\""). Field order: `["feet", "whole", "num", "den"]` where `whole` is the inches part.
- **`ftInSeparate`:** Same as `ftIn` internally, but output shows "3 ft 6 1/2 in" (feet and inches as separate words).

Changing `unitsMode` resets the entry and moves to the first field; pending operations/accumulator persist.

## Keyboard support

`FractionCalculatorApp.tsx` wires all keys:
- `0–9`: digits
- `+`, `-`, `*`, `/`: operators (symbols may differ: `−`, `×`, `÷`)
- `Enter` or `=`: equals
- `Backspace`: remove last digit (or step backward into a previous field)
- `Delete`: clear current entry
- `Escape`: all clear (reset to empty, no accumulator, no pending op)
- `.`: field advance

## Preferences persistence

`localStorage` key: `"dohdash-fraction-calculator-prefs"`. Stores and restores on app load:
- `display` (fraction/decimal)
- `unitsMode` (plain/ftIn/ftInSeparate)
- `accuracy` (64/32/16/8)

History is ephemeral (session only); calculator resets on app reload.

## Calculation flow

1. User enters a number across one or more fields (digits advance with field advance; backspace steps back).
2. User hits an operator button → current entry is converted to `Rational` and stored in `accumulator`, pending op recorded, entry reset.
3. User enters another number and hits operator or equals.
   - If `pendingOp` is set: apply the pending operation to `accumulator` and the second entry, store result back in `accumulator`, clear `pendingOp`, reset entry.
   - If equals: apply the operation, store in `accumulator`, add to `history`, reset entry.
4. User can click a history item to recall its result as the new `accumulator`, clearing any pending op.

Error stops all input except `allClear` (escape key).

## Testing

`fraction.test.ts` and `calculator.test.ts` — pure function tests for rational arithmetic and state machine transitions. No component or integration tests.
