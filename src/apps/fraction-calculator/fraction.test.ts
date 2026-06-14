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
  toFeetAndInches,
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

  test("formats negative sub-inch values without a redundant zero", () => {
    expect(toFeetInchesString({ numerator: -1n, denominator: 2n }, 16n)).toBe(`-1/2"`);
  });
});

describe("toFeetAndInches", () => {
  test("splits feet and inches into separate values", () => {
    expect(toFeetAndInches({ numerator: 85n, denominator: 2n }, 16n)).toEqual({
      feet: 3n,
      inches: "6 1/2",
    });
  });

  test("formats whole inches under a foot with feet = 0", () => {
    expect(toFeetAndInches(fromInt(8), 16n)).toEqual({ feet: 0n, inches: "8" });
  });

  test("formats exact feet with no remainder", () => {
    expect(toFeetAndInches(fromInt(24), 16n)).toEqual({ feet: 2n, inches: "0" });
  });

  test("formats negative values with sign on feet", () => {
    expect(toFeetAndInches({ numerator: -85n, denominator: 2n }, 16n)).toEqual({
      feet: -3n,
      inches: "6 1/2",
    });
  });

  test("formats negative sub-inch values with sign on inches", () => {
    expect(toFeetAndInches({ numerator: -1n, denominator: 2n }, 16n)).toEqual({
      feet: 0n,
      inches: "-1/2",
    });
  });
});
