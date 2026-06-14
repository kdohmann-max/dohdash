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

  // round(n * denominatorLimit / denominator) using integer arithmetic,
  // with ties rounded to even (banker's rounding)
  const scaled = n * denominatorLimit;
  const wholeUnits = scaled / denominator;
  const remainder = scaled % denominator;
  const doubled = remainder * 2n;
  let rounded: bigint;
  if (doubled > denominator) {
    rounded = wholeUnits + 1n;
  } else if (doubled < denominator) {
    rounded = wholeUnits;
  } else {
    rounded = wholeUnits % 2n === 0n ? wholeUnits : wholeUnits + 1n;
  }

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
    inchRem === 0n
      ? `${inches}`
      : inches === 0n
        ? `${inchRem}/${denominator}`
        : `${inches} ${inchRem}/${denominator}`;

  if (feet === 0n) return `${sign}${inchesPart}"`;
  return `${sign}${feet}' ${inchesPart}"`;
}

/**
 * Like `toFeetInchesString`, but returns feet and inches as separate plain
 * values (no `'`/`"` glyphs). Sign is attached to feet when nonzero,
 * otherwise to inches.
 */
export function toFeetAndInches(
  r: Rational,
  accuracyDenominator: bigint,
): { feet: bigint; inches: string } {
  const rounded = roundToFraction(r, accuracyDenominator);
  const { numerator, denominator } = rounded;
  const negative = numerator < 0n;
  const n = negative ? -numerator : numerator;

  const totalInchesWhole = n / denominator;
  const inchRem = n % denominator;
  const feet = totalInchesWhole / 12n;
  const inches = totalInchesWhole % 12n;

  const inchesStr =
    inchRem === 0n
      ? `${inches}`
      : inches === 0n
        ? `${inchRem}/${denominator}`
        : `${inches} ${inchRem}/${denominator}`;

  if (feet === 0n) return { feet: 0n, inches: negative ? `-${inchesStr}` : inchesStr };
  return { feet: negative ? -feet : feet, inches: inchesStr };
}
