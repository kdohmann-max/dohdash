// The "MD Toolbar": ribbon-style controls so users can format without knowing
// Markdown syntax. Heading selector, list-type selector, the "F" formatting
// ribbon (driven by formattingSelectors.ts), and the Archive Done action.

import { useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  FORMATTING_SELECTORS,
  type FormattingSelector,
} from "../data/formattingSelectors";
import { evaluateMath } from "../editor/math";
import { archiveDone } from "../editor/archive";
import { uploadImage } from "../../../storage/db";
import { CommentIcon } from "../../../icons";

interface Props {
  editor: Editor | null;
  onAddComment?: () => void;
  onShareOpen?: () => void;
  isReadOnly?: boolean;
}

const HEADING_LEVELS = [1, 2, 3, 4] as const;

export function Toolbar({ editor, onAddComment, onShareOpen, isReadOnly }: Props) {
  const [showFormat, setShowFormat] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file || !editor) return;
    try {
      const src = await uploadImage(file);
      editor.chain().focus().setImage({ src, alt: file.name }).run();
    } catch (err) {
      alert(`Image upload failed: ${err}`);
    }
  }

  const headingValue = (() => {
    for (const level of HEADING_LEVELS) {
      if (editor.isActive("heading", { level })) return String(level);
    }
    return "p";
  })();

  function setHeading(value: string) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (value === "p") chain.setParagraph().run();
    else chain.toggleHeading({ level: Number(value) as 1 | 2 | 3 | 4 }).run();
  }

  const listValue = editor.isActive("taskList")
    ? "task"
    : editor.isActive("bulletList")
    ? "bullet"
    : editor.isActive("orderedList")
    ? "ordered"
    : "none";

  function setList(value: string) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (value === "bullet") chain.toggleBulletList().run();
    else if (value === "ordered") chain.toggleOrderedList().run();
    else if (value === "task") chain.toggleTaskList().run();
    else
      chain
        .liftListItem("listItem")
        .liftListItem("taskItem")
        .run();
  }

  function applySelector(sel: FormattingSelector) {
    if (!editor) return;
    if (sel.kind === "math") {
      runMath();
      return;
    }
    editor.chain().focus().toggleFormatSelector(sel.id).run();
    setShowFormat(false);
  }

  function runMath() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, " ");
    const result = evaluateMath(text);
    if (result === null) {
      window.alert(`"${text}" is not a valid expression.`);
      return;
    }
    editor
      .chain()
      .focus()
      .insertContentAt(to, `\n= ${result}`)
      .run();
    setShowFormat(false);
  }

  return (
    <div className="toolbar">
      <div className="ribbon">
            {!isReadOnly && (
              <>
                <label className="control">
                  <span className="control-label">Heading</span>
                  <select value={headingValue} onChange={(e) => setHeading(e.target.value)}>
                    <option value="p">Normal text</option>
                    {HEADING_LEVELS.map((l) => (
                      <option key={l} value={l}>Heading {l}</option>
                    ))}
                  </select>
                </label>
                <label className="control">
                  <span className="control-label">List</span>
                  <select value={listValue} onChange={(e) => setList(e.target.value)}>
                    <option value="none">None</option>
                    <option value="bullet">Bulleted</option>
                    <option value="ordered">Numbered</option>
                    <option value="task">Task (checkbox)</option>
                  </select>
                </label>
                <button className={`f-button ${showFormat ? "active" : ""}`} onClick={() => setShowFormat((v) => !v)} title="Formatting selectors">F</button>
                <button className="image-btn" onClick={() => fileInput.current?.click()} title="Insert image" aria-label="Insert image">
                  <svg width="16" height="16" aria-hidden="true"><use href="/icons.svg#paperclip-icon" /></svg>
                </button>
                <input ref={fileInput} type="file" accept="image/*" hidden onChange={onPickImage} />
              </>
            )}
            {onAddComment ? (
              <button className="image-btn" onClick={onAddComment} title="Comment on selection" aria-label="Comment on selection">
                <CommentIcon size={16} />
              </button>
            ) : null}
            {!isReadOnly && (
              <button className="archive-btn" onClick={() => archiveDone(editor)}>Archive Done</button>
            )}
            {onShareOpen && (
              <button
                className="toolbar-btn"
                title="Share note"
                onClick={onShareOpen}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                </svg>
              </button>
            )}
          </div>

      {!isReadOnly && showFormat && (
        <div className="ribbon sub-ribbon">
          {FORMATTING_SELECTORS.map((sel) => (
            <button
              key={sel.id}
              className={
                sel.kind === "mark" && editor.isActive("formatSelector", { name: sel.id })
                  ? "active"
                  : ""
              }
              title={sel.description}
              onClick={() => applySelector(sel)}
            >
              {sel.label}
            </button>
          ))}
          <button className="clear-fmt" onClick={() => editor.chain().focus().unsetFormatSelector().run()}>
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
