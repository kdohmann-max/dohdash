// The "MD Toolbar": ribbon-style controls so users can format without knowing
// Markdown syntax. Heading selector, list-type selector, the "F" formatting
// ribbon (driven by formattingSelectors.ts), and the Archive Done action.

import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import {
  FORMATTING_SELECTORS,
  type FormattingSelector,
} from "../data/formattingSelectors";
import { archiveDone } from "../editor/archive";
import { uploadImage, listProfiles, type Profile } from "../../../storage/db";
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

  // "TAG with user" picker state
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  // The selection to tag, captured before the picker steals focus.
  const tagRange = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (userPickerOpen && people.length === 0) {
      void listProfiles().then(setPeople).catch(() => {});
    }
  }, [userPickerOpen, people.length]);

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
    if (sel.kind === "user") {
      openUserPicker();
      return;
    }
    editor.chain().focus().toggleFormatSelector(sel.id).run();
    setShowFormat(false);
  }

  function openUserPicker() {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      window.alert("Select some text to tag people on first.");
      return;
    }
    tagRange.current = { from, to };
    setSelectedUsers(new Set());
    setUserFilter("");
    setUserPickerOpen(true);
  }

  function toggleUser(id: string) {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyUserTag() {
    if (!editor || !tagRange.current) return;
    const names = people
      .filter((p) => selectedUsers.has(p.id))
      .map((p) => p.displayName ?? p.email);
    if (names.length === 0) {
      setUserPickerOpen(false);
      return;
    }
    editor
      .chain()
      .focus()
      .setTextSelection(tagRange.current)
      .setUserTag(names.join(", "))
      .run();
    setUserPickerOpen(false);
    setShowFormat(false);
  }

  return (
    <div className="toolbar">
      <div className="ribbon-2">
            {!isReadOnly && (
              <>
                <label className="control">
                  <select aria-label="Text style" title="Text style" value={headingValue} onChange={(e) => setHeading(e.target.value)}>
                    <option value="p">Normal</option>
                    {HEADING_LEVELS.map((l) => (
                      <option key={l} value={l}>H{l}</option>
                    ))}
                  </select>
                </label>
                <label className="control">
                  <select aria-label="List type" title="List type" value={listValue} onChange={(e) => setList(e.target.value)}>
                    <option value="none">List</option>
                    <option value="bullet">Bulleted</option>
                    <option value="ordered">Numbered</option>
                    <option value="task">Checklist</option>
                  </select>
                </label>
                <button className={`f-button ${showFormat ? "active" : ""}`} onClick={() => setShowFormat((v) => !v)} title="Tag / formatting selectors">TAG</button>
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
              <button className="archive-btn" onClick={() => archiveDone(editor)} title="Move completed tasks to an archived section">Archive</button>
            )}
            {onShareOpen && (
              <button
                className="toolbar-btn"
                title="Share note"
                onClick={onShareOpen}
              >
                Share
              </button>
            )}
          </div>

      {!isReadOnly && showFormat && (
        <div className="ribbon-2 ribbon-3">
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

      {userPickerOpen && (
        <div className="tag-user-picker">
          <div className="tag-user-head">
            <span className="tag-user-title">Tag people on this section</span>
            <button className="tag-user-close" onClick={() => setUserPickerOpen(false)}>✕</button>
          </div>
          <input
            className="tag-user-filter"
            placeholder="Filter people by name or email…"
            value={userFilter}
            autoFocus
            onChange={(e) => setUserFilter(e.target.value)}
          />
          <ul className="tag-user-list">
            {people
              .filter((p) => {
                const f = userFilter.trim().toLowerCase();
                return (
                  !f ||
                  (p.displayName?.toLowerCase().includes(f) ?? false) ||
                  p.email.toLowerCase().includes(f)
                );
              })
              .map((p) => (
                <li key={p.id} className="tag-user-row">
                  <label className="tag-user-label">
                    <input
                      type="checkbox"
                      className="tag-user-check"
                      checked={selectedUsers.has(p.id)}
                      onChange={() => toggleUser(p.id)}
                    />
                    <span className="tag-user-name">{p.displayName ?? p.email}</span>
                    <span className="tag-user-email">{p.email}</span>
                  </label>
                </li>
              ))}
          </ul>
          <div className="tag-user-actions">
            <button className="tag-user-cancel" onClick={() => setUserPickerOpen(false)}>Cancel</button>
            <button className="tag-user-apply" onClick={applyUserTag} disabled={selectedUsers.size === 0}>
              Tag {selectedUsers.size > 0 ? `(${selectedUsers.size})` : ""}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
