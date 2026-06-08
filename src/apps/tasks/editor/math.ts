// Safe arithmetic evaluator for the "Math" formatting selector.
// Accepts only digits, whitespace, decimal points, parentheses and the
// operators + - * / % — never arbitrary JS. Returns null on invalid input.

const ALLOWED = /^[\d\s.+\-*/%()]+$/;

export function evaluateMath(input: string): number | null {
  const expr = input.trim();
  if (!expr || !ALLOWED.test(expr)) return null;
  try {
    // Function constructor over a whitelisted character set: no identifiers,
    // so there is nothing callable/accessible from inside.
    const result = Function(`"use strict"; return (${expr});`)();
    return typeof result === "number" && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
