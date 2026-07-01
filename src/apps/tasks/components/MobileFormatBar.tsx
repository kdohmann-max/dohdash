import type { Editor } from "@tiptap/react";
import type { Dispatch, SetStateAction } from "react";
import { archiveDone } from "../editor/archive";
import { CommentIcon, PaperclipIcon } from "../../../icons";
import { FORMATTING_SELECTORS } from "../data/formattingSelectors";

interface Props {
  editor: Editor | null;
  keyboardHeight: number;
  showFormat: boolean;
  setShowFormat: Dispatch<SetStateAction<boolean>>;
  fileInputRef: { current: HTMLInputElement | null };
  onAddComment: () => void;
  onShare: () => void;
  onTagWithUser: () => void;
  isOwner: boolean;
  isCommentOnly: boolean;
}

function prevent(e: React.PointerEvent) {
  e.preventDefault();
}

export function MobileFormatBar({
  editor,
  keyboardHeight,
  showFormat,
  setShowFormat,
  fileInputRef,
  onAddComment,
  onShare,
  onTagWithUser,
  isOwner,
  isCommentOnly,
}: Props) {
  if (!editor || isCommentOnly) return null;

  const headingLevel = (() => {
    for (const level of [1, 2, 3, 4] as const) {
      if (editor.isActive("heading", { level })) return level;
    }
    return 0;
  })();

  // Cycle: Normal → H1 → H2 → H3 → Normal
  function cycleHeading() {
    const next = headingLevel >= 3 ? 0 : headingLevel + 1;
    const chain = editor!.chain().focus();
    if (next === 0) chain.setParagraph().run();
    else chain.setHeading({ level: next as 1 | 2 | 3 }).run();
  }

  const isBold = editor.isActive("bold");
  const isItalic = editor.isActive("italic");
  const listState = editor.isActive("taskList")
    ? "task"
    : editor.isActive("bulletList")
    ? "bullet"
    : editor.isActive("orderedList")
    ? "ordered"
    : "none";

  return (
    <div className="mobile-format-bar" style={{ bottom: keyboardHeight }}>
      {/* TAG palette stacks above the main bar when open */}
      {showFormat && (
        <div className="mfb-palette">
          {FORMATTING_SELECTORS.map((sel) => (
            <button
              key={sel.id}
              className={`mfb-palette-btn${
                sel.kind === "mark" && editor.isActive("formatSelector", { name: sel.id })
                  ? " active"
                  : ""
              }`}
              onPointerDown={(e) => {
                prevent(e);
                if (sel.kind === "user") {
                  setShowFormat(false);
                  onTagWithUser();
                } else {
                  editor.chain().focus().toggleFormatSelector(sel.id).run();
                  setShowFormat(false);
                }
              }}
              title={sel.description}
            >
              {sel.label}
            </button>
          ))}
          <button
            className="mfb-palette-btn mfb-palette-clear"
            onPointerDown={(e) => {
              prevent(e);
              editor.chain().focus().unsetFormatSelector().run();
              setShowFormat(false);
            }}
          >
            Clear
          </button>
        </div>
      )}

      <div className="mfb-main">
        {/* Bold */}
        <button
          className={`mfb-btn${isBold ? " active" : ""}`}
          onPointerDown={(e) => { prevent(e); editor.chain().focus().toggleBold().run(); }}
          title="Bold"
        >
          <strong>B</strong>
        </button>

        {/* Italic */}
        <button
          className={`mfb-btn${isItalic ? " active" : ""}`}
          onPointerDown={(e) => { prevent(e); editor.chain().focus().toggleItalic().run(); }}
          title="Italic"
        >
          <em>I</em>
        </button>

        <span className="mfb-sep" />

        {/* Heading cycle: tap to advance Normal → H1 → H2 → H3 → Normal */}
        <button
          className="mfb-btn mfb-heading"
          onPointerDown={(e) => { prevent(e); cycleHeading(); }}
          title="Heading — tap to cycle Normal → H1 → H2 → H3"
        >
          {headingLevel === 0 ? "P" : `H${headingLevel}`}
        </button>

        <span className="mfb-sep" />

        {/* Bullet list */}
        <button
          className={`mfb-btn${listState === "bullet" ? " active" : ""}`}
          onPointerDown={(e) => { prevent(e); editor.chain().focus().toggleBulletList().run(); }}
          title="Bullet list"
        >
          •
        </button>

        {/* Numbered list */}
        <button
          className={`mfb-btn${listState === "ordered" ? " active" : ""}`}
          onPointerDown={(e) => { prevent(e); editor.chain().focus().toggleOrderedList().run(); }}
          title="Numbered list"
        >
          1.
        </button>

        {/* Checklist */}
        <button
          className={`mfb-btn${listState === "task" ? " active" : ""}`}
          onPointerDown={(e) => { prevent(e); editor.chain().focus().toggleTaskList().run(); }}
          title="Checklist"
        >
          ☐
        </button>

        <span className="mfb-sep" />

        {/* TAG: opens the priority/formatting palette above this bar */}
        <button
          className={`mfb-btn${showFormat ? " active" : ""}`}
          onPointerDown={(e) => { prevent(e); setShowFormat((v) => !v); }}
          title="Priority tags / formatting"
        >
          TAG
        </button>

        {/* Image */}
        <button
          className="mfb-btn"
          onPointerDown={(e) => { prevent(e); fileInputRef.current?.click(); }}
          title="Insert image"
        >
          <PaperclipIcon size={18} />
        </button>

        {/* Comment */}
        <button
          className="mfb-btn"
          onPointerDown={(e) => { prevent(e); onAddComment(); }}
          title="Add comment"
        >
          <CommentIcon size={18} />
        </button>

        {/* Archive done tasks */}
        <button
          className="mfb-btn"
          onPointerDown={(e) => { prevent(e); archiveDone(editor); }}
          title="Archive done tasks"
        >
          Archive
        </button>

        {/* Share (owner only) */}
        {isOwner && (
          <button
            className="mfb-btn"
            onPointerDown={(e) => { prevent(e); onShare(); }}
            title="Share"
          >
            Share
          </button>
        )}
      </div>
    </div>
  );
}
