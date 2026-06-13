// src/apps/fraction-calculator/calculator.test.ts
import { describe, expect, test } from "vitest";
import { initialState, dispatch } from "./calculator";
import { toFractionString } from "./fraction";

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

  test("toggleUnits mid-entry resets the current entry", () => {
    let s = initialState();
    s = dispatch(s, { type: "digit", value: 1 });
    s = dispatch(s, { type: "fieldAdvance" });
    s = dispatch(s, { type: "digit", value: 2 });
    s = dispatch(s, { type: "fieldAdvance" });
    s = dispatch(s, { type: "digit", value: 3 });
    s = dispatch(s, { type: "toggleUnits" });
    expect(s.entry).toEqual({ feet: 0, whole: 0, num: 0, den: null });
    expect(s.activeField).toBe("feet");
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
