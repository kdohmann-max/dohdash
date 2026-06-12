// A TipTap mark anchoring a comment thread to a text range. Each instance
// carries a `commentId` matching a doc_comments row and renders as
//   <span data-comment-id="<uuid>" class="doc-comment">…</span>
// which is valid inline HTML inside Markdown, so documents round-trip through
// the `.md` store the same way FormatSelector does.
//
// Named `docComment` (not `comment`) because `fmt-comment` already exists as
// a FormatSelector value; the two marks coexist on the same text.
//
// Resolved state is NOT stored in the markdown — a decoration plugin holds
// the set of resolved ids (pushed from React via setMeta) and adds the
// `doc-comment--resolved` class, so resolving never rewrites the document.

import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

export const RESOLVED_META = "docCommentResolved";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    docComment: {
      /** Anchor the current selection to a comment thread. */
      setDocComment: (commentId: string) => ReturnType;
      /** Remove every range of the mark carrying this commentId. */
      unsetDocCommentById: (commentId: string) => ReturnType;
    };
  }
}

const resolvedPluginKey = new PluginKey<Set<string>>("docCommentResolvedState");

function findCommentRanges(doc: ProseMirrorNode, commentId: string): { from: number; to: number }[] {
  const ranges: { from: number; to: number }[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = node.marks.find((m) => m.type.name === "docComment" && m.attrs.commentId === commentId);
    if (mark) ranges.push({ from: pos, to: pos + node.nodeSize });
  });
  return ranges;
}

export const DocCommentMark = Mark.create({
  name: "docComment",

  // Typing at the edge of a comment shouldn't extend it, and it stacks with
  // bold/italic/formatSelector.
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-comment-id"),
        renderHTML: (attrs) =>
          attrs.commentId ? { "data-comment-id": attrs.commentId, class: "doc-comment" } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setDocComment:
        (commentId: string) =>
        ({ commands }) =>
          commands.setMark(this.name, { commentId }),
      unsetDocCommentById:
        (commentId: string) =>
        ({ tr, state, dispatch }) => {
          const ranges = findCommentRanges(state.doc, commentId);
          if (ranges.length === 0) return false;
          if (dispatch) {
            for (const range of ranges) {
              tr.removeMark(range.from, range.to, state.schema.marks.docComment);
            }
            dispatch(tr);
          }
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<Set<string>>({
        key: resolvedPluginKey,
        state: {
          init: () => new Set<string>(),
          apply: (tr, value) => (tr.getMeta(RESOLVED_META) as Set<string> | undefined) ?? value,
        },
        props: {
          decorations(state) {
            const resolved = resolvedPluginKey.getState(state);
            if (!resolved || resolved.size === 0) return DecorationSet.empty;
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const mark = node.marks.find(
                (m) => m.type.name === "docComment" && resolved.has(m.attrs.commentId as string),
              );
              if (mark) {
                decorations.push(
                  Decoration.inline(pos, pos + node.nodeSize, { class: "doc-comment--resolved" }),
                );
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },

  // tiptap-markdown serialization: emit/parse the inline <span> wrapper.
  addStorage() {
    return {
      markdown: {
        serialize: {
          open(_state: unknown, mark: { attrs: { commentId: string } }) {
            return `<span data-comment-id="${mark.attrs.commentId}" class="doc-comment">`;
          },
          close: "</span>",
        },
        parse: {},
      },
    };
  },
});
