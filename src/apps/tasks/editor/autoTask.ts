// Auto-task formatting.
//
// When a heading contains the word "todo", "task", or "checklist", any plain
// bullet list ("-") under that heading is automatically reinterpreted as a
// task list ("- [ ]"), so its items render as checkboxes. The conversion is
// scoped: only bullet lists between such a heading and the next heading of the
// same-or-higher level are affected.
//
// Implemented as an appendTransaction so it reacts to typing without the user
// choosing the task list type manually.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

const TASK_HEADING_RE = /\b(todo|task|checklist)s?\b/i;

interface ListHit {
  pos: number;
  node: PMNode;
}

export const autoTaskKey = new PluginKey("dohdocs-auto-task");

export const AutoTask = Extension.create({
  name: "autoTask",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: autoTaskKey,
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((t) => t.docChanged)) return null;

          const { doc, schema } = newState;
          const taskList = schema.nodes.taskList;
          const taskItem = schema.nodes.taskItem;
          if (!taskList || !taskItem) return null;

          // Track whether we are currently under a "task" heading. A heading of
          // equal or higher level (<= level) closes the active scope.
          let activeLevel = 0; // 0 = not in a task scope
          const hits: ListHit[] = [];

          doc.forEach((node, offset) => {
            if (node.type.name === "heading") {
              const level = node.attrs.level as number;
              if (TASK_HEADING_RE.test(node.textContent)) {
                activeLevel = level;
              } else if (activeLevel && level <= activeLevel) {
                activeLevel = 0;
              }
              return;
            }
            if (activeLevel && node.type.name === "bulletList") {
              hits.push({ pos: offset, node });
            }
          });

          if (hits.length === 0) return null;

          const tr = newState.tr;
          // Replace from the bottom up so earlier positions remain valid.
          for (const { pos, node } of [...hits].reverse()) {
            const items: PMNode[] = [];
            node.forEach((item) => {
              // listItem content -> taskItem content (paragraph(s)).
              items.push(taskItem.create({ checked: false }, item.content));
            });
            const replacement = taskList.create(node.attrs, items);
            tr.replaceWith(pos, pos + node.nodeSize, replacement);
          }
          if (!tr.docChanged) return null;

          // A wholesale node replacement collapses any selection that was inside
          // the list, so the caret jumps (and Enter then lands in the wrong
          // place). The replacement is structurally identical in size, so the
          // original positions still address the same text — restore them.
          const { from, to } = newState.selection;
          if (from <= tr.doc.content.size && to <= tr.doc.content.size) {
            tr.setSelection(TextSelection.create(tr.doc, from, to));
          }
          return tr;
        },
      }),
    ];
  },
});
