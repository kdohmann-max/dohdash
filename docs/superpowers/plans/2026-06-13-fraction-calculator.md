# Fraction Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new DohDash app — a mobile-friendly fraction/decimal calculator with feet-inches measurement mode, an accuracy/rounding selector, and a scrollable calculation history.

**Architecture:** A pure, dependency-free `Rational` math module (`fraction.ts`, BigInt numerator/denominator, GCD-reduced) backs a calculator state machine in `FractionCalculatorApp.tsx`. UI is split into `Display`, `HistoryTape`, `Keypad`, and `ModeControls` components, all styled with existing design tokens. The app is registered in `APP_REGISTRY` and routed like Chicken Scratch — fully client-side, no Supabase/auth.

**Tech Stack:** React 19 + TypeScript, Vitest for the math module, existing CSS custom-property design system.

---

## Task 1: Rational math core

**Files:**
- Create: `src/apps/fraction-calculator/fraction.ts`
- Test: `src/apps/fraction-calculator/fraction.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/apps/fraction-calculator/fraction.test.ts
import { describe, expect, test } from "vitest";
import {
  add,
  sub,
  mul,
  div,
  fromInt,
  reduce,
  toDecimalString,
  toFractionString,
  toFeetInchesString,
  roundToFraction,
  type Rational,
} from "./fraction";

describe("reduce", () => {
  test("reduces to lowest terms and keeps denominator positive", () => {
    expect(reduce({ numerator: 2n, denominator: 4n })).toEqual({ numerator: 1n, denominator: 2n });
    expect(reduce({ numerator: 4n, denominator: -8n })).toEqual({ numerator: -1n, denominator: 2n });
    expect(reduce({ numerator: -3n, denominator: -9n })).toEqual({ numerator: 1n, denominator: 3n });
    expect(reduce({ numerator: 0n, denominator: 5n })).toEqual({ numerator: 0n, denominator: 1n });
  });
});

describe("arithmetic", () => {
  const half: Rational = { numerator: 1n, denominator: 2n };
  const third: Rational = { numerator: 1n, denominator: 3n };

  test("add", () => {
    expect(add(half, third)).toEqual({ numerator: 5n, denominator: 6n });
  });

  test("sub", () => {
    expect(sub(half, third)).toEqual({ numerator: 1n, denominator: 6n });
  });

  test("mul", () => {
    expect(mul(half, third)).toEqual({ numerator: 1n, denominator: 6n });
  });

  test("div", () => {
    expect(div(half, third)).toEqual({ numerator: 3n, denominator: 2n });
  });

  test("repeated thirds sum to exactly one", () => {
    let acc = fromInt(0);
    for (let i = 0; i < 3; i++) acc = add(acc, third);
    expect(acc).toEqual({ numerator: 1n, denominator: 1n });
  });

  test("div by zero throws", () => {
    expect(() => div(half, fromInt(0))).toThrow();
  });
});

describe("toDecimalString", () => {
  test("formats and trims trailing zeros", () => {
    expect(toDecimalString({ numerator: 1n, denominator: 2n })).toBe("0.5");
    expect(toDecimalString({ numerator: 1n, denominator: 4n })).toBe("0.25");
    expect(toDecimalString({ numerator: 3n, denominator: 1n })).toBe("3");
    expect(toDecimalString({ numerator: -1n, denominator: 4n })).toBe("-0.25");
  });

  test("repeating decimals truncate to 6 places", () => {
    expect(toDecimalString({ numerator: 1n, denominator: 3n })).toBe("0.333333");
  });
});

describe("toFractionString", () => {
  test("whole numbers", () => {
    expect(toFractionString(fromInt(3))).toBe("3");
    expect(toFractionString(fromInt(0))).toBe("0");
  });

  test("proper fractions", () => {
    expect(toFractionString({ numerator: 1n, denominator: 2n })).toBe("1/2");
    expect(toFractionString({ numerator: -1n, denominator: 2n })).toBe("-1/2");
  });

  test("mixed numbers", () => {
    expect(toFractionString({ numerator: 7n, denominator: 2n })).toBe("3 1/2");
    expect(toFractionString({ numerator: -7n, denominator: 2n })).toBe("-3 1/2");
  });
});

describe("roundToFraction", () => {
  test("snaps to nearest 1/16", () => {
    // 5/16 stays as-is
    expect(roundToFraction({ numerator: 5n, denominator: 16n }, 16n)).toEqual({
      numerator: 5n,
      denominator: 16n,
    });
    // 1/3 -> nearest 16th is 5/16 (0.3125, closer than 4/16=0.25)
    expect(roundToFraction({ numerator: 1n, denominator: 3n }, 16n)).toEqual({
      numerator: 5n,
      denominator: 16n,
    });
  });

  test("snaps to nearest 1/8 and reduces", () => {
    // 1/16 rounds to nearest 1/8 -> 0/8 -> 0
    expect(roundToFraction({ numerator: 1n, denominator: 16n }, 8n)).toEqual({
      numerator: 0n,
      denominator: 1n,
    });
    // 3/16 rounds to nearest 1/8 -> 2/8 -> 1/4
    expect(roundToFraction({ numerator: 3n, denominator: 16n }, 8n)).toEqual({
      numerator: 1n,
      denominator: 4n,
    });
  });
});

describe("toFeetInchesString", () => {
  test("formats feet, inches, and fraction", () => {
    // 42.5 inches = 3' 6 1/2"
    expect(toFeetInchesString({ numerator: 85n, denominator: 2n }, 16n)).toBe(`3' 6 1/2"`);
  });

  test("formats whole inches under a foot", () => {
    expect(toFeetInchesString(fromInt(8), 16n)).toBe(`8"`);
  });

  test("formats exact feet with no remainder", () => {
    expect(toFeetInchesString(fromInt(24), 16n)).toBe(`2' 0"`);
  });

  test("formats negative values", () => {
    expect(toFeetInchesString({ numerator: -85n, denominator: 2n }, 16n)).toBe(`-3' 6 1/2"`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/apps/fraction-calculator/fraction.test.ts`
Expected: FAIL — `Cannot find module './fraction'` (or similar resolution error), since `fraction.ts` doesn't exist yet.

- [ ] **Step 3: Implement `fraction.ts`**

```ts
// src/apps/fraction-calculator/fraction.ts

/** A reduced rational number. `denominator` is always > 0. */
export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

/** Reduce to lowest terms with a positive denominator. Zero normalizes to 0/1. */
export function reduce(r: Rational): Rational {
  let { numerator, denominator } = r;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };
  const g = gcd(numerator, denominator);
  return { numerator: numerator / g, denominator: denominator / g };
}

export function fromInt(n: number | bigint): Rational {
  return { numerator: BigInt(n), denominator: 1n };
}

export function add(a: Rational, b: Rational): Rational {
  return reduce({
    numerator: a.numerator * b.denominator + b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  });
}

export function sub(a: Rational, b: Rational): Rational {
  return reduce({
    numerator: a.numerator * b.denominator - b.numerator * a.denominator,
    denominator: a.denominator * b.denominator,
  });
}

export function mul(a: Rational, b: Rational): Rational {
  return reduce({
    numerator: a.numerator * b.numerator,
    denominator: a.denominator * b.denominator,
  });
}

export function div(a: Rational, b: Rational): Rational {
  if (b.numerator === 0n) throw new Error("Division by zero");
  return reduce({
    numerator: a.numerator * b.denominator,
    denominator: a.denominator * b.numerator,
  });
}

const DECIMAL_PLACES = 6;

/** Decimal string, truncated to DECIMAL_PLACES and trimmed of trailing zeros. */
export function toDecimalString(r: Rational): string {
  const { numerator, denominator } = reduce(r);
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const whole = n / denominator;
  let remainder = n % denominator;

  let frac = "";
  for (let i = 0; i < DECIMAL_PLACES; i++) {
    remainder *= 10n;
    frac += (remainder / denominator).toString();
    remainder %= denominator;
  }
  frac = frac.replace(/0+$/, "");

  const sign = negative ? "-" : "";
  return frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}

/** "3 1/2", "1/2", "-3 1/2", or "3" for whole numbers. */
export function toFractionString(r: Rational): string {
  const { numerator, denominator } = reduce(r);
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const whole = n / denominator;
  const rem = n % denominator;
  const sign = negative ? "-" : "";

  if (rem === 0n) return `${sign}${whole}`;
  if (whole === 0n) return `${sign}${rem}/${denominator}`;
  return `${sign}${whole} ${rem}/${denominator}`;
}

/**
 * Round to the nearest 1/denominatorLimit (e.g. 16n for nearest 1/16),
 * returned as a reduced Rational.
 */
export function roundToFraction(r: Rational, denominatorLimit: bigint): Rational {
  const { numerator, denominator } = reduce(r);
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;

  // round(n * denominatorLimit / denominator) using integer arithmetic
  const scaled = n * denominatorLimit;
  const wholeUnits = scaled / denominator;
  const remainder = scaled % denominator;
  const rounded = remainder * 2n >= denominator ? wholeUnits + 1n : wholeUnits;

  const signed = negative ? -rounded : rounded;
  return reduce({ numerator: signed, denominator: denominatorLimit });
}

/**
 * Format inches as feet/inches/fraction, e.g. `3' 6 1/2"`, `8"`, `2' 0"`.
 * `accuracyDenominator` is the fraction accuracy (e.g. 16n for nearest 1/16).
 */
export function toFeetInchesString(r: Rational, accuracyDenominator: bigint): string {
  const rounded = roundToFraction(r, accuracyDenominator);
  const { numerator, denominator } = rounded;
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;
  const sign = negative ? "-" : "";

  const totalInchesWhole = n / denominator;
  const inchRem = n % denominator;
  const feet = totalInchesWhole / 12n;
  const inches = totalInchesWhole % 12n;

  const inchesPart =
    inchRem === 0n ? `${inches}` : `${inches} ${inchRem}/${denominator}`;

  if (feet === 0n) return `${sign}${inchesPart}"`;
  return `${sign}${feet}' ${inchesPart}"`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/apps/fraction-calculator/fraction.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/apps/fraction-calculator/fraction.ts src/apps/fraction-calculator/fraction.test.ts
git commit -m "feat: add Rational math core for Fraction Calculator"
```

---

## Task 2: Icon + registry + route wiring

**Files:**
- Modify: `src/icons/index.tsx`
- Modify: `src/apps/registry.tsx`
- Modify: `src/App.tsx`
- Create: `src/apps/fraction-calculator/FractionCalculatorApp.tsx` (placeholder)
- Create: `src/apps/fraction-calculator/FractionCalculatorApp.css` (placeholder)

- [ ] **Step 1: Add `FractionCalculatorIcon` to the icon library**

In `src/icons/index.tsx`, add after `MoonIcon` (end of file):

```tsx
export function FractionCalculatorIcon({ size }: { size?: number } = {}) {
  return (
    <svg {...svgProps(size)}>
      <path d="M5 5h14" />
      <path d="M5 19h14" />
      <path d="M8 3l-2 4" />
      <path d="M16 17l2 4" />
      <rect x="4" y="9" width="16" height="6" rx="1" />
    </svg>
  );
}
```

- [ ] **Step 2: Create a placeholder app component**

```tsx
// src/apps/fraction-calculator/FractionCalculatorApp.tsx
import "./FractionCalculatorApp.css";

export function FractionCalculatorApp() {
  return <div className="fraction-calculator">Fraction Calculator</div>;
}
```

```css
/* src/apps/fraction-calculator/FractionCalculatorApp.css */
.fraction-calculator {
  display: flex;
  flex-direction: column;
  max-width: 420px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
  padding: var(--spacing-lg);
  gap: var(--spacing-md);
}
```

- [ ] **Step 3: Register the app**

In `src/apps/registry.tsx`, add `FractionCalculatorIcon` to the icon import:

```tsx
import {
  JobFilesIcon,
  TasksIcon,
  CalendarIcon,
  ContactsIcon,
  TimeTrackerIcon,
  ExpensesIcon,
  CleanUpIcon,
  ChickenScratchIcon,
  FractionCalculatorIcon,
} from "../icons";
```

Then append a new entry to `APP_REGISTRY` (after the `chicken-scratch` entry, before the closing `];`):

```tsx
  {
    id: "fraction-calculator",
    name: "Fraction Calculator",
    icon: <FractionCalculatorIcon />,
    description: "Calculate with fractions, decimals, and measurements.",
    route: "/dashboard/app/fraction-calculator",
  },
```

- [ ] **Step 4: Wire the route**

In `src/App.tsx`, add the import:

```tsx
import { FractionCalculatorApp } from "./apps/fraction-calculator/FractionCalculatorApp";
```

In `AppRoute()`, add a case before the fallback:

```tsx
function AppRoute() {
  const { appId } = useParams<{ appId: string }>();
  if (appId === "tasks") return <TasksApp />;
  if (appId === "chicken-scratch") return <ChickenScratchApp />;
  if (appId === "fraction-calculator") return <FractionCalculatorApp />;
  return <AppStubPage />;
}
```

- [ ] **Step 5: Verify the build and lint**

Run: `npm run build`
Expected: no TypeScript errors. Only report any error/warning lines per CLAUDE.md console-output discipline.

- [ ] **Step 6: Commit**

```bash
git add src/icons/index.tsx src/apps/registry.tsx src/App.tsx src/apps/fraction-calculator/FractionCalculatorApp.tsx src/apps/fraction-calculator/FractionCalculatorApp.css
git commit -m "feat: register Fraction Calculator app with placeholder UI"
```

---

## Task 3: Calculator state machine + types

**Files:**
- Create: `src/apps/fraction-calculator/calculator.ts`
- Test: `src/apps/fraction-calculator/calculator.test.ts`

This task implements the pure reducer logic (no React) so it's independently testable, then Task 4 wires it into the component.

- [ ] **Step 1: Write the failing tests**

```ts
// src/apps/fraction-calculator/calculator.test.ts
import { describe, expect, test } from "vitest";
import { initialState, dispatch } from "./calculator";
import { toFractionString } from "./fraction";

function entryToString(state: ReturnType<typeof initialState>): string {
  const { feet, whole, num, den } = state.entry;
  let s = "";
  if (state.unitsMode && feet) s += `${feet}'`;
  if (whole) s += `${s ? " " : ""}${whole}`;
  if (den !== null) s += `${s && !s.endsWith("'") ? " " : ""}${num}/${den}`;
  return s || "0";
}

describe("digit entry", () => {
  test("digits append to the active field (whole)", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "digit", value: 2 });
    expect(s.entry.whole).toBe(12);
    expect(s.activeField).toBe("whole");
  });

  test("field-advance moves whole -> num -> den", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "fieldAdvance" });
    s = dispatch(s, { type: "digit", value: 3 });
    s = dispatch(s, { type: "fieldAdvance" });
    s = dispatch(s, { type: "digit", value: 4 });
    expect(s.entry).toEqual({ feet: 0, whole: 1, num: 3, den: 4 });
    expect(s.activeField).toBe("den");
  });

  test("field-advance skips feet when units mode is off", () => {
    let s = initialState();
    s = dispatch(s, { type: "fieldAdvance" });
    expect(s.activeField).toBe("num");
  });

  test("field-advance includes feet when units mode is on", () => {
    let s = initialState();
    s = dispatch(s, { type: "toggleUnits" });
    expect(s.activeField).toBe("feet");
    s = dispatch(s, { type: "fieldAdvance" });
    expect(s.activeField).toBe("whole");
  });
});

describe("backspace", () => {
  test("removes last digit of active field", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "digit", value: 2 });
    s = dispatch(s, { type: "backspace" });
    expect(s.entry.whole).toBe(1);
  });

  test("steps back to previous field when active field is empty", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "fieldAdvance" }); // -> num
    s = dispatch(s, { type: "backspace" }); // num empty -> back to whole
    expect(s.activeField).toBe("whole");
    expect(s.entry.whole).toBe(1);
  });
});

describe("operators and equals", () => {
  test("1/2 + 1/4 = 3/4", () => {
    let s = initialState();
    // enter 1/2
    s = dispatch(s, { type: "fieldAdvance" }); // num
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "fieldAdvance" }); // den
    s = dispatch(s, { type: "digit", value: 2 });
    s = dispatch(s, { type: "operator", op: "+" });

    // enter 1/4
    s = dispatch(s, { type: "fieldAdvance" }); // num
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "fieldAdvance" }); // den
    s = dispatch(s, { type: "digit", value: 4 });
    s = dispatch(s, { type: "equals" });

    expect(s.accumulator).not.toBeNull();
    expect(toFractionString(s.accumulator!)).toBe("3/4");
    expect(s.history).toHaveLength(1);
    expect(s.history[0].result).toEqual(s.accumulator);
  });

  test("chained operators evaluate the pending op first", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 2 });
    s = dispatch(s, { type: "operator", op: "+" });
    s = dispatch(s, { type: "digit", value: 3 });
    s = dispatch(s, { type: "operator", op: "*" }); // evaluates 2+3=5, then pending *
    s = dispatch(s, { type: "digit", value: 2 });
    s = dispatch(s, { type: "equals" }); // 5 * 2 = 10
    expect(toFractionString(s.accumulator!)).toBe("10");
  });
});

describe("clear", () => {
  test("C clears only the current entry", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 5 });
    s = dispatch(s, { type: "operator", op: "+" });
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "clearEntry" });
    expect(s.entry).toEqual({ feet: 0, whole: 0, num: 0, den: null });
    expect(s.accumulator).not.toBeNull();
    expect(s.pendingOp).toBe("+");
  });

  test("AC resets everything except history", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 5 });
    s = dispatch(s, { type: "operator", op: "+" });
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "equals" });
    s = dispatch(s, { type: "allClear" });
    expect(s.accumulator).toBeNull();
    expect(s.pendingOp).toBeNull();
    expect(s.entry).toEqual({ feet: 0, whole: 0, num: 0, den: null });
    expect(s.history).toHaveLength(1);
  });
});

describe("division by zero", () => {
  test("entry with den=0 sets error on operator commit", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "fieldAdvance" }); // num
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "fieldAdvance" }); // den
    s = dispatch(s, { type: "digit", value: 0 });
    s = dispatch(s, { type: "operator", op: "+" });
    expect(s.error).toBe(true);
  });

  test("division by zero operator sets error", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 5 });
    s = dispatch(s, { type: "operator", op: "/" });
    s = dispatch(s, { type: "digit", value: 0 });
    s = dispatch(s, { type: "equals" });
    expect(s.error).toBe(true);
  });

  test("AC recovers from error", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 5 });
    s = dispatch(s, { type: "operator", op: "/" });
    s = dispatch(s, { type: "digit", value: 0 });
    s = dispatch(s, { type: "equals" });
    s = dispatch(s, { type: "allClear" });
    expect(s.error).toBe(false);
  });
});

describe("mode toggles", () => {
  test("toggleDisplay flips between fraction and decimal", () => {
    let s = initialState();
    expect(s.display).toBe("fraction");
    s = dispatch(s, { type: "toggleDisplay" });
    expect(s.display).toBe("decimal");
  });

  test("setAccuracy updates the accuracy denominator", () => {
    let s = initialState();
    s = dispatch(s, { type: "setAccuracy", value: 32 });
    expect(s.accuracy).toBe(32);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/apps/fraction-calculator/calculator.test.ts`
Expected: FAIL — `Cannot find module './calculator'`.

- [ ] **Step 3: Implement `calculator.ts`**

```ts
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

/** `den === null` means the user hasn't started entering a fraction part yet. */
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

/** Throws if the entry's denominator field is non-zero (i.e. user typed into it). */
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/apps/fraction-calculator/calculator.test.ts`
Expected: PASS — all tests green. If the "chained operators" test fails because `*`/`/` aren't matched in `applyOp`, double check the `Operator` type uses `"*"`/`"/"` consistently (this plan uses `*`/`/` for the calculator's internal operator type, distinct from the display glyphs `×`/`÷` used in Task 4's UI).

- [ ] **Step 5: Commit**

```bash
git add src/apps/fraction-calculator/calculator.ts src/apps/fraction-calculator/calculator.test.ts
git commit -m "feat: add Fraction Calculator state machine"
```

---

## Task 4: Display component

**Files:**
- Create: `src/apps/fraction-calculator/components/Display.tsx`
- Create: `src/apps/fraction-calculator/components/Display.css`

- [ ] **Step 1: Implement `Display.tsx`**

```tsx
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
```

```css
/* src/apps/fraction-calculator/components/Display.css */
.fc-display {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  background: var(--bg-alt);
  border: 1px solid var(--border);
  border-radius: var(--rounded-md);
  padding: var(--spacing-lg);
  min-height: 100px;
  gap: var(--spacing-xs);
}

.fc-display-pending {
  color: var(--muted);
  font-size: 1.1rem;
  min-height: 1.4em;
}

.fc-display-current {
  font-size: 2.5rem;
  font-weight: var(--font-weight-heading);
  font-family: var(--font-heading);
  word-break: break-all;
}

.fc-display-current--error {
  color: var(--error);
  font-size: 1.5rem;
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: no TypeScript errors (only report error/warning lines).

- [ ] **Step 3: Commit**

```bash
git add src/apps/fraction-calculator/components/Display.tsx src/apps/fraction-calculator/components/Display.css
git commit -m "feat: add Fraction Calculator display component"
```

---

## Task 5: HistoryTape component

**Files:**
- Create: `src/apps/fraction-calculator/components/HistoryTape.tsx`
- Create: `src/apps/fraction-calculator/components/HistoryTape.css`

- [ ] **Step 1: Implement `HistoryTape.tsx`**

```tsx
// src/apps/fraction-calculator/components/HistoryTape.tsx
import { useEffect, useRef } from "react";
import { toDecimalString, toFeetInchesString, toFractionString } from "../fraction";
import type { CalcState, HistoryEntry } from "../calculator";
import "./HistoryTape.css";

function formatResult(entry: HistoryEntry, state: CalcState): string {
  if (state.unitsMode) return toFeetInchesString(entry.result, BigInt(state.accuracy));
  if (state.display === "decimal") return toDecimalString(entry.result);
  return toFractionString(entry.result);
}

export function HistoryTape({
  state,
  onSelect,
}: {
  state: CalcState;
  onSelect: (entry: HistoryEntry) => void;
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
  );
}
```

```css
/* src/apps/fraction-calculator/components/HistoryTape.css */
.fc-history {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  max-height: 140px;
  overflow-y: auto;
}

.fc-history--empty {
  min-height: 0;
}

.fc-history-item {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-sm);
  background: none;
  border: none;
  border-radius: var(--rounded-sm);
  padding: var(--spacing-xs) var(--spacing-sm);
  color: var(--muted);
  font-size: 0.9rem;
  text-align: left;
  cursor: pointer;
}

.fc-history-item:hover {
  background: var(--accent-soft);
  color: var(--text);
}

.fc-history-result {
  font-weight: var(--font-weight-heading);
  white-space: nowrap;
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/apps/fraction-calculator/components/HistoryTape.tsx src/apps/fraction-calculator/components/HistoryTape.css
git commit -m "feat: add Fraction Calculator history tape component"
```

---

## Task 6: ModeControls component

**Files:**
- Create: `src/apps/fraction-calculator/components/ModeControls.tsx`
- Create: `src/apps/fraction-calculator/components/ModeControls.css`

- [ ] **Step 1: Implement `ModeControls.tsx`**

```tsx
// src/apps/fraction-calculator/components/ModeControls.tsx
import type { Accuracy, CalcState } from "../calculator";
import "./ModeControls.css";

const ACCURACY_OPTIONS: Accuracy[] = [8, 16, 32, 64];

export function ModeControls({
  state,
  onToggleDisplay,
  onToggleUnits,
  onSetAccuracy,
}: {
  state: CalcState;
  onToggleDisplay: () => void;
  onToggleUnits: () => void;
  onSetAccuracy: (value: Accuracy) => void;
}) {
  return (
    <div className="fc-mode-controls">
      <div className="fc-mode-toggles">
        <button
          type="button"
          className="fc-toggle"
          aria-pressed={state.display === "decimal"}
          onClick={onToggleDisplay}
        >
          {state.display === "fraction" ? "Fraction" : "Decimal"}
        </button>
        <button
          type="button"
          className="fc-toggle"
          aria-pressed={state.unitsMode}
          onClick={onToggleUnits}
        >
          {state.unitsMode ? "ft/in" : "Plain"}
        </button>
      </div>

      {state.display === "fraction" && (
        <div className="fc-accuracy">
          {ACCURACY_OPTIONS.map((acc) => (
            <button
              key={acc}
              type="button"
              className="fc-accuracy-chip"
              aria-pressed={state.accuracy === acc}
              onClick={() => onSetAccuracy(acc)}
            >
              1/{acc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

```css
/* src/apps/fraction-calculator/components/ModeControls.css */
.fc-mode-controls {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.fc-mode-toggles,
.fc-accuracy {
  display: flex;
  gap: var(--spacing-sm);
}

.fc-toggle,
.fc-accuracy-chip {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--rounded-md);
  padding: var(--spacing-sm);
  font-size: 0.9rem;
  font-family: var(--font-body);
  color: var(--text);
  cursor: pointer;
}

.fc-toggle[aria-pressed="true"],
.fc-accuracy-chip[aria-pressed="true"] {
  background: var(--accent-soft);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: var(--font-weight-heading);
}

.fc-accuracy-chip {
  flex: 1;
  text-align: center;
}
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/apps/fraction-calculator/components/ModeControls.tsx src/apps/fraction-calculator/components/ModeControls.css
git commit -m "feat: add Fraction Calculator mode controls component"
```

---

## Task 7: Keypad component

**Files:**
- Create: `src/apps/fraction-calculator/components/Keypad.tsx`
- Create: `src/apps/fraction-calculator/components/Keypad.css`

- [ ] **Step 1: Implement `Keypad.tsx`**

```tsx
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
```

- [ ] **Step 2: Implement `Keypad.css`**

```css
/* src/apps/fraction-calculator/components/Keypad.css */
.fc-keypad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-sm);
}

.fc-key {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--rounded-md);
  font-family: var(--font-body);
  font-size: 1.4rem;
  padding: var(--spacing-md) 0;
  cursor: pointer;
  color: var(--text);
}

.fc-key:hover {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.fc-key--fn {
  color: var(--muted);
  font-size: 1.1rem;
}

.fc-key--op {
  color: var(--accent);
  font-weight: var(--font-weight-heading);
}

.fc-key--equals {
  grid-column: span 2;
  background: var(--accent);
  color: var(--bg);
  border: none;
  font-weight: var(--font-weight-heading);
}

.fc-key--equals:hover {
  background: var(--accent);
  opacity: 0.9;
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/apps/fraction-calculator/components/Keypad.tsx src/apps/fraction-calculator/components/Keypad.css
git commit -m "feat: add Fraction Calculator keypad component"
```

---

## Task 8: Wire up FractionCalculatorApp + localStorage persistence

**Files:**
- Modify: `src/apps/fraction-calculator/calculator.ts`
- Modify: `src/apps/fraction-calculator/calculator.test.ts`
- Modify: `src/apps/fraction-calculator/FractionCalculatorApp.tsx`

- [ ] **Step 1: Write a failing test for `recallResult`**

Add to `src/apps/fraction-calculator/calculator.test.ts`:

```ts
describe("recallResult", () => {
  test("loads a value as the accumulator, clearing pending state", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 9 });
    s = dispatch(s, { type: "operator", op: "+" });
    s = dispatch(s, { type: "recallResult", value: { numerator: 5n, denominator: 1n } });
    expect(s.accumulator).toEqual({ numerator: 5n, denominator: 1n });
    expect(s.pendingOp).toBeNull();
    expect(s.entry).toEqual({ feet: 0, whole: 0, num: 0, den: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/apps/fraction-calculator/calculator.test.ts`
Expected: FAIL — `recallResult` is not a valid `CalcAction` type / case not handled.

- [ ] **Step 3: Add the `recallResult` action**

Add to the `CalcAction` union in `src/apps/fraction-calculator/calculator.ts` (alongside `clearEntry`/`allClear`):

```ts
  | { type: "recallResult"; value: Rational }
```

Add a case in `dispatch`:

```ts
    case "recallResult":
      return {
        ...state,
        accumulator: action.value,
        pendingOp: null,
        entry: { ...EMPTY_ENTRY },
        activeField: fieldOrder(state.unitsMode)[0],
        error: false,
      };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/apps/fraction-calculator/calculator.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Replace the placeholder app component**

```tsx
// src/apps/fraction-calculator/FractionCalculatorApp.tsx
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
```

`FractionCalculatorApp.css` from Task 2 already covers this layout — no changes needed.

- [ ] **Step 6: Run all tests**

Run: `npx vitest run src/apps/fraction-calculator`
Expected: PASS — all tests in `fraction.test.ts` and `calculator.test.ts` green.

- [ ] **Step 7: Run the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add src/apps/fraction-calculator/FractionCalculatorApp.tsx src/apps/fraction-calculator/calculator.ts src/apps/fraction-calculator/calculator.test.ts
git commit -m "feat: wire up Fraction Calculator app with history recall and prefs persistence"
```

---

## Task 9: Manual verification in the browser

**Files:** none (manual QA pass)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`
Expected: server starts at `http://localhost:5173` (or next free port).

- [ ] **Step 2: Sign in and open the app**

Navigate to `/dashboard`, confirm the "Fraction Calculator" tile appears in the launcher with its icon, and open it (`/dashboard/app/fraction-calculator`).

- [ ] **Step 3: Verify core arithmetic**

- Enter `1`, advance field, `1`, advance field, `2` → entry shows `1 1/2`. Press `+`.
- Enter `1`, advance field, `1`, advance field, `4` → entry shows `1 1/4`. Press `=`.
- Expected result: `2 3/4`, and a history entry appears.

- [ ] **Step 4: Verify mode toggles**

- Toggle to "Decimal" — result should redisplay as `2.75`.
- Toggle "ft/in" units mode — re-enter a value and confirm feet/inches formatting (e.g. `42` whole inches → `3' 6"`).
- Change the accuracy chips (1/8, 1/16, 1/32, 1/64) and confirm fraction-mode display snaps accordingly without changing the underlying accumulator (chain another operation and confirm no drift).

- [ ] **Step 5: Verify error handling and history recall**

- Enter `5`, `÷`, `0`, `=` → display shows "Error". Press `AC` to recover.
- Tap a history entry and confirm it becomes the new accumulator (next operator continues from it).

- [ ] **Step 6: Verify persistence**

- Set display to "Decimal" and units mode on, reload the page, confirm both preferences persist (history does not).

- [ ] **Step 7: Verify mobile layout**

- Use browser dev tools device emulation (e.g. iPhone viewport) to confirm the keypad, display, and large text remain usable and nothing overflows horizontally.

No commit for this task — it's a verification pass. If any issues are found, file them as follow-up fixes to the relevant task's files.
