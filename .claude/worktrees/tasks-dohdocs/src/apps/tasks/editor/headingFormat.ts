// Heading auto-formatting.
//
// Headings are normalized to Title Case (and have runaway whitespace trimmed)
// so they read consistently. To avoid fighting the user mid-word, a heading is
// only reformatted once the selection has left it — i.e. when you click/arrow
// away or start a new block. Paired with `font-variant: small-caps` in CSS for
// the classic small-caps heading look.
//
// We only rewrite headings made of a single plain text node, so inline marks
// (e.g. a FormatSelector span inside a heading) are never destroyed.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// Lowercase words in Title Case unless first/last.
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of",
  "on", "or", "per", "the", "to", "via", "vs", "with",
]);

export function toTitleCase(input: string): string {
  const cleaned = input.replace(/\s+/g, " ").trim();
  if (!cleaned) return cleaned;
  const words = cleaned.split(" ");
  return words
    .map((word, i) => {
      const lower = word.toLowerCase();
      const isEdge = i === 0 || i === words.length - 1;
      if (!isEdge && MINOR_WORDS.has(lower)) return lower;
      // Capitalize the first alphanumeric character, keep the rest as typed.
      return lower.replace(/[a-z0-9]/, (c) => c.toUpperCase());
    })
    .join(" ");
}

export const headingFormatKey = new PluginKey("dohdocs-heading-format");

export const HeadingFormat = Extension.create({
  name: "headingFormat",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: headingFormatKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;

          const { doc, schema } = newState;
          const { from, to } = newState.selection;
          const tr = newState.tr;
          let changed = false;

          doc.descendants((node, pos) => {
            if (node.type.name !== "heading") return;
            // Skip the heading the user is currently editing.
            const start = pos + 1;
            const end = pos + node.nodeSize - 1;
            if (from <= end && to >= start) return;
            // Only touch simple single-text-node headings (preserve marks).
            if (node.childCount !== 1) return;
            const child = node.firstChild!;
            if (!child.isText || !child.text) return;

            const titled = toTitleCase(child.text);
            if (titled === child.text) return;

            tr.replaceWith(start, end, schema.text(titled, child.marks));
            changed = true;
          });

          return changed ? tr : null;
        },
      }),
    ];
  },
});
