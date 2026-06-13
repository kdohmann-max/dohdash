# Fraction Calculator — Design Spec

## Overview

A new DohDash app: a mobile-friendly calculator that natively works with fractions
(and optionally feet/inches measurements), with a switchable decimal display, a
rounding/accuracy selector for fraction display, and a scrollable history of past
calculations.

App id: `fraction-calculator`. Self-contained, client-side only — no Supabase/auth
involvement, no new tables.

## Math core: exact rational arithmetic

All values are represented internally as a reduced rational:

```ts
interface Rational {
  numerator: bigint;
  denominator: bigint; // always > 0
}
```

`BigInt` avoids overflow as numerators/denominators grow through chained
operations. Arithmetic (`add`, `sub`, `mul`, `div`) reduces the result via GCD
after every operation, so `1/3 + 1/3 + 1/3 === 1` exactly — no floating-point
drift.

Lives in `src/apps/fraction-calculator/fraction.ts`, a pure module with no
DOM/React dependencies (mirrors `chicken-scratch/dimensions.ts`).

### Display formatting

- **Decimal**: `numerator / denominator` as a float, formatted to a fixed number
  of decimal places (6), trimmed of trailing zeros.
- **Fraction**: reduce to whole + proper fraction (`num/den`). If the fraction
  mode accuracy selector is active, the *displayed* fraction is snapped to the
  nearest `1/N` (N = 64/32/16/8). Rounding is display-only — the underlying
  `Rational` accumulator stays exact, so chained calculations never compound
  rounding error.
- **Feet/inches** (units mode on): the `Rational` represents a value in inches;
  format as `feet' inches-num/den"`.

Accuracy selector only affects fraction-mode display; decimal mode always shows
full fixed-precision decimals regardless of the selected accuracy.

## Entry model & calculator state machine

```ts
interface EntryValue {
  feet: number;   // 0 / unused if units mode off
  whole: number;
  num: number;
  den: number;    // defaults to 1 until the user types into the den field
}

type ActiveField = "feet" | "whole" | "num" | "den";

type CalcState = {
  entry: EntryValue;
  activeField: ActiveField;
  accumulator: Rational | null;     // running total
  pendingOp: "+" | "-" | "×" | "÷" | null;
  display: "fraction" | "decimal";  // mode toggle, persisted
  unitsMode: boolean;                // feet/inches toggle, persisted
  accuracy: 64 | 32 | 16 | 8;         // rounding denominator, persisted (default 16)
  history: HistoryEntry[];           // session-only tape
  error: boolean;                    // division-by-zero state
};

interface HistoryEntry {
  expression: string; // e.g. "1 3/4 + 2/3"
  result: Rational;
}
```

### Entry flow (traditional calculator, running total)

- **Digit keys** append to `entry[activeField]`.
- **Field-advance key** (stacked-fraction icon, "⁄") cycles `activeField`:
  `feet → whole → num → den` (skipping `feet` when units mode is off), wrapping
  to the start on a fresh entry.
- **Backspace**: removes the last digit of the active field; if the active field
  is empty, steps back to the previous field.
- **Operator keys** (`+ − × ÷`): commit the current `EntryValue` → `Rational`,
  combine with `accumulator` via `pendingOp` (or seed `accumulator` on first
  entry). If an operator was already pending, evaluate it first, push a tape
  entry, then set the new `pendingOp`. Reset `entry`/`activeField`.
- **`=`**: evaluates `pendingOp`, appends `"<expr> = <result>"` to `history`,
  and sets `accumulator` to the result (tappable from the tape to reuse as the
  next entry's starting accumulator).
- **`C`**: clears the current entry only (`entry` reset to zeros, `activeField`
  reset to the first field).
- **`AC`**: resets the entire calculator — `accumulator`, `pendingOp`, `entry`,
  `error` — but does not clear `history`.
- **Division by zero** (a `den = 0` in an entry being committed, or a `÷ 0`
  operator evaluation) sets `error: true`. Display shows `"Error"`; only `AC`
  recovers.

### Persistence

`display`, `unitsMode`, and `accuracy` are persisted to `localStorage` (same
pattern as Tasks' `sort` preference) so the user's preferred mode sticks across
visits. `history` is session-only (in-memory state, cleared on reload).

## UI layout & components

```
src/apps/fraction-calculator/
  FractionCalculatorApp.tsx     — state machine, wires everything together
  FractionCalculatorApp.css
  fraction.ts                   — pure Rational math
  fraction.test.ts              — unit tests
  components/
    Display.tsx / .css          — large-text current entry + accumulator/result
    HistoryTape.tsx / .css       — scrollable list of past calculations, tap-to-reuse
    Keypad.tsx / .css            — digit grid, operators, field-advance, backspace, C/AC, =
    ModeControls.tsx / .css      — decimal/fraction toggle, units toggle, accuracy chips
```

Single-column, mobile-first layout (scales up on larger screens):

1. **History tape** — scrollable, capped height, newest entry at the bottom.
2. **Display** — large entry/result text; fraction mode renders the
   numerator/denominator as a stacked glyph (and feet/inches segments when
   units mode is on).
3. **Mode controls row** — Decimal/Fraction toggle, Units toggle, and accuracy
   chips (1/64, 1/32, 1/16, 1/8 — shown only in fraction mode, default 1/16).
4. **Keypad** — large touch targets in a grid: digits 0-9, field-advance (⁄),
   backspace, `C`/`AC`, operators (`+ − × ÷`), `=`.

All styling uses existing design tokens (`--accent`, `--rounded-md`, the
5-step spacing scale, Comfortaa fonts via `--font-*` vars) per `styleguide.md`
— no new colors or fonts introduced.

## Testing

`fraction.test.ts` covers `Rational` arithmetic (add/sub/mul/div + reduction),
decimal/fraction/feet-inches formatting, and round-to-nearest-`1/N` — following
the precedent of `chicken-scratch/dimensions.test.ts`.

## Registry integration

- New icon in `src/icons/index.tsx` — a stylized fraction-bar glyph (e.g. "½"),
  following the existing `svgProps()` stroke-only convention.
- New entry in `APP_REGISTRY` (`src/apps/registry.tsx`):
  `{ id: "fraction-calculator", name: "Fraction Calculator", icon: <FractionCalculatorIcon />, description: "Calculate with fractions, decimals, and measurements.", route: "/dashboard/app/fraction-calculator" }`
- New case in `App.tsx`'s `AppRoute()`:
  `if (appId === "fraction-calculator") return <FractionCalculatorApp />;`
- No Supabase/auth involvement.

## Out of scope (v1)

- Parentheses / full expression entry (deferred — traditional calculator flow only)
- sqrt, %, sign-toggle, or other scientific-calculator operations
- Persisted (cross-session) history
- Negative number entry (results can be negative from subtraction, but there is
  no explicit "+/-" input key)
