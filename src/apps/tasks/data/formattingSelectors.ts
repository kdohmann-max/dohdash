// Single source of truth for the formatting selectors shown in the "F" ribbon.
// Each id maps to a `.fmt-<id>` CSS class in styles/formatting-selectors.css.

export interface FormattingSelector {
  id: string;
  label: string;
  description: string;
  /** Special behaviors that aren't a plain styling mark. */
  kind?: "mark" | "user";
}

export const FORMATTING_SELECTORS: FormattingSelector[] = [
  { id: "p1", label: "P1", description: "Red highlight (priority 1)", kind: "mark" },
  { id: "p2", label: "P2", description: "Yellow highlight (priority 2)", kind: "mark" },
  { id: "p3", label: "P3", description: "Blue highlight (priority 3)", kind: "mark" },
  { id: "comment", label: "Comment", description: "Italic, quoted", kind: "mark" },
  { id: "user-tag", label: "TAG with user", description: "Tag this section for specific people", kind: "user" },
];

/** Names of the selectors that are rendered as a FormatSelector mark. */
export const MARK_SELECTOR_IDS = FORMATTING_SELECTORS.filter(
  (s) => s.kind === "mark"
).map((s) => s.id);
