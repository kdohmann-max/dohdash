// "Archive Done" task-list feature.
//
// Archived tasks live in the document (so they persist in the `.md` file) under
// a top-level "Archived" heading. Each archived item keeps a reference to the
// heading it came from via a `· from: <heading>` suffix plus a `#archived` tag,
// matching the spec's request to tag items with their master heading.
//
// Unarchive is offered as a clickable widget next to each archived item,
// implemented with a ProseMirror decoration so the task content stays native
// and editable.

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";

export const ARCHIVE_HEADING = "Archived";
const FROM_RE = /\s*·\s*from:\s*(.*?)\s*#archived\s*$/;

/** Nearest heading text at or above the given document position. */
function headingAbove(doc: PMNode, pos: number): string {
  let heading = "";
  doc.descendants((node, nodePos) => {
    if (nodePos >= pos) return false;
    if (node.type.name === "heading") heading = node.textContent;
    return true;
  });
  return heading;
}

/** Document position range of the "Archived" heading, if present. */
function findArchiveHeading(doc: PMNode): number | null {
  let found: number | null = null;
  doc.descendants((node, pos) => {
    if (
      found === null &&
      node.type.name === "heading" &&
      node.textContent.trim() === ARCHIVE_HEADING
    ) {
      found = pos;
    }
  });
  return found;
}

interface CheckedItem {
  pos: number;
  node: PMNode;
  source: string;
}

/** Move every checked, not-yet-archived task item into the Archived section. */
export function archiveDone(editor: Editor): void {
  const { state } = editor;
  const { doc, schema } = state;
  const archivePos = findArchiveHeading(doc);

  // Collect checked items that are not already inside the Archived section.
  const items: CheckedItem[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "taskItem" || !node.attrs.checked) return;
    if (archivePos !== null && pos > archivePos) return; // already archived
    items.push({ pos, node, source: headingAbove(doc, pos) });
  });
  if (items.length === 0) return;

  let tr = state.tr;

  // Build the archived versions first (before positions shift on deletion).
  const archivedNodes: PMNode[] = items.map(({ node, source }) => {
    const text = node.textContent.replace(FROM_RE, "").trim();
    const tagged = source
      ? `${text} · from: ${source} #archived`
      : `${text} · #archived`;
    return schema.nodes.taskItem.create(
      { checked: true },
      schema.nodes.paragraph.create(null, schema.text(tagged))
    );
  });

  // Delete originals from bottom to top so earlier positions stay valid.
  for (const { pos, node } of [...items].reverse()) {
    tr = tr.delete(pos, pos + node.nodeSize);
  }

  // Ensure an Archived heading + task list exist at the end, then append.
  const heading = schema.nodes.heading.create(
    { level: 2 },
    schema.text(ARCHIVE_HEADING)
  );
  const list = schema.nodes.taskList.create(null, archivedNodes);

  const endPos = findArchiveHeading(tr.doc);
  if (endPos === null) {
    tr = tr.insert(tr.doc.content.size, heading);
    tr = tr.insert(tr.doc.content.size, list);
  } else {
    // Append into the existing archive list (the node right after the heading).
    const headingNode = tr.doc.nodeAt(endPos)!;
    const listPos = endPos + headingNode.nodeSize;
    const listNode = tr.doc.nodeAt(listPos);
    if (listNode && listNode.type.name === "taskList") {
      tr = tr.insert(listPos + listNode.nodeSize - 1, archivedNodes);
    } else {
      tr = tr.insert(listPos, list);
    }
  }

  editor.view.dispatch(tr.scrollIntoView());
}

/** Move an archived task item back out of the Archived section. */
export function unarchiveItem(editor: Editor, itemPos: number): void {
  const { state } = editor;
  const node = state.doc.nodeAt(itemPos);
  if (!node || node.type.name !== "taskItem") return;

  const match = node.textContent.match(FROM_RE);
  const source = match?.[1]?.trim() ?? "";
  const text = node.textContent.replace(FROM_RE, "").trim();
  const { schema } = state;

  let tr = state.tr.delete(itemPos, itemPos + node.nodeSize);

  const restored = schema.nodes.taskItem.create(
    { checked: true },
    schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined)
  );

  // Find the source heading (in the post-delete doc) and insert just after it.
  let insertAt = 0;
  if (source) {
    tr.doc.descendants((n, pos) => {
      if (n.type.name === "heading" && n.textContent.trim() === source) {
        insertAt = pos + n.nodeSize;
      }
    });
  }
  if (insertAt === 0) insertAt = tr.doc.content.size;

  // Wrap in a task list so it renders as a checkbox item.
  const wrapper = schema.nodes.taskList.create(null, restored);
  tr = tr.insert(insertAt, wrapper);
  editor.view.dispatch(tr.scrollIntoView());
}

export const archivePluginKey = new PluginKey("dohdocs-archive");

/** Adds an "⤴ Unarchive" widget before each task item in the Archived section. */
export const ArchiveDecorations = Extension.create({
  name: "archiveDecorations",

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: archivePluginKey,
        props: {
          decorations(state) {
            const archivePos = findArchiveHeading(state.doc);
            if (archivePos === null) return DecorationSet.empty;
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (pos <= archivePos) return;
              if (node.type.name !== "taskItem") return;
              const widget = Decoration.widget(
                pos + 1,
                () => {
                  const btn = document.createElement("button");
                  btn.className = "unarchive-btn";
                  btn.title = "Unarchive";
                  btn.textContent = "⤴";
                  btn.contentEditable = "false";
                  btn.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    unarchiveItem(editor as Editor, pos);
                  });
                  return btn;
                },
                { side: -1 }
              );
              decos.push(widget);
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
