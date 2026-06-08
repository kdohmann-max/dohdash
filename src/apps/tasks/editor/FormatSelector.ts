// A TipTap mark for the named formatting selectors (P1, P2, P3, Comment, ...).
// Each instance carries a `name` attribute and renders as
//   <span class="fmt-<name>" data-fmt="<name>">…</span>
// which is valid inline HTML inside Markdown, so documents round-trip through
// the `.md` store without a custom syntax.

import { Mark, mergeAttributes, InputRule } from "@tiptap/core";
import { MARK_SELECTOR_IDS } from "../data/formattingSelectors";

export interface FormatSelectorOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    formatSelector: {
      /** Toggle a named formatting selector on the current selection. */
      toggleFormatSelector: (name: string) => ReturnType;
      /** Remove any formatting selector from the current selection. */
      unsetFormatSelector: () => ReturnType;
    };
  }
}

export const FormatSelector = Mark.create<FormatSelectorOptions>({
  name: "formatSelector",

  addOptions() {
    return { HTMLAttributes: {} };
  },

  addAttributes() {
    return {
      name: {
        default: null,
        parseHTML: (el) =>
          (el as HTMLElement).getAttribute("data-fmt") ??
          ((el as HTMLElement).className.match(/fmt-([\w-]+)/)?.[1] ?? null),
        renderHTML: (attrs) =>
          attrs.name
            ? { "data-fmt": attrs.name, class: `fmt-${attrs.name}` }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-fmt]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addInputRules() {
    const markType = this.type;
    return MARK_SELECTOR_IDS.map(
      (id) =>
        new InputRule({
          find: new RegExp(`(?<!\\w)(${id}) $`),
          handler: ({ state, range }) => {
            const { tr } = state;
            tr.delete(range.from, range.to);
            tr.setStoredMarks([markType.create({ name: id })]);
          },
        })
    );
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        if (editor.isActive("formatSelector")) {
          editor.commands.unsetMark(this.name);
        }
        return false;
      },
    };
  },

  addCommands() {
    return {
      toggleFormatSelector:
        (name: string) =>
        ({ commands, state }) => {
          // If the same selector is already active, remove it; otherwise apply.
          const active = state.selection.$from
            .marks()
            .find((m) => m.type.name === this.name && m.attrs.name === name);
          if (active) return commands.unsetMark(this.name);
          return commands.setMark(this.name, { name });
        },
      unsetFormatSelector:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },

  // tiptap-markdown serialization: emit/parse the inline <span> wrapper.
  addStorage() {
    return {
      markdown: {
        serialize: {
          open(_state: unknown, mark: { attrs: { name: string } }) {
            return `<span data-fmt="${mark.attrs.name}" class="fmt-${mark.attrs.name}">`;
          },
          close: "</span>",
        },
        parse: {},
      },
    };
  },
});
