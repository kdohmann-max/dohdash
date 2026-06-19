import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import { FormatSelector } from "./FormatSelector";
import { DocCommentMark } from "./CommentMark";
import { ArchiveDecorations } from "./archive";
import { AutoTask } from "./autoTask";
import { HeadingFormat } from "./headingFormat";
import { InlineMath } from "./inlineMath";

export function buildExtensions() {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    Image.configure({ inline: true, allowBase64: true }),
    FormatSelector,
    DocCommentMark,
    AutoTask,
    HeadingFormat,
    InlineMath,
    ArchiveDecorations,
    Placeholder.configure({
      placeholder: "Start writing… use the toolbar — no Markdown knowledge needed.",
    }),
    Markdown.configure({
      html: true,
      tightLists: true,
      bulletListMarker: "-",
      linkify: true,
      transformPastedText: true,
    }),
  ];
}
