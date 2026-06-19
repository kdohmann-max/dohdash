import { Extension } from "@tiptap/core";
import { evaluateMath } from "./math";

// Characters that can appear in an inline math expression.
const MATH_CHAR_RE = /[\d\s.+\-*/%()]/;
const HAS_OPERATOR_RE = /[+\-*/%]/;

function formatResult(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(6).replace(/\.?0+$/, "");
}

// Scan backwards in textBefore to find a math expression ending at the cursor.
// Returns the trimmed expression and the document-local offset where it starts
// (after any leading whitespace), or null if no valid expression is found.
function findMathExpr(
  textBefore: string
): { expr: string; startOffset: number } | null {
  let i = textBefore.length;
  while (i > 0 && MATH_CHAR_RE.test(textBefore[i - 1])) i--;
  const raw = textBefore.slice(i);
  const expr = raw.trim();
  if (!expr || !HAS_OPERATOR_RE.test(expr)) return null;
  // Must start with a digit or open-paren, end with a digit or close-paren.
  if (!/^[\d(]/.test(expr) || !/[\d)]$/.test(expr)) return null;
  const leadingSpaces = raw.length - raw.trimStart().length;
  return { expr, startOffset: i + leadingSpaces };
}

// When the user types = after a math expression (e.g. "10 * 3.5="),
// evaluate it and replace the expression with the result. The = is consumed
// and not inserted. If no valid expression is found, = is inserted normally.
export const InlineMath = Extension.create({
  name: "inlineMath",

  addKeyboardShortcuts() {
    return {
      "=": ({ editor }) => {
        const { state } = editor.view;
        const { selection, doc } = state;
        const { from, empty } = selection;
        if (!empty) return false;

        const $pos = doc.resolve(from);
        const textBefore = $pos.parent.textContent.slice(0, $pos.parentOffset);
        const found = findMathExpr(textBefore);
        if (!found) return false;

        const result = evaluateMath(found.expr);
        if (result === null) return false;

        editor.view.dispatch(
          state.tr.insertText(`=${formatResult(result)}`, from)
        );
        return true;
      },
    };
  },
});
