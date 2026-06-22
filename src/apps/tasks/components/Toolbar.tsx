import { useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Dispatch, SetStateAction } from "react";
import {
  FORMATTING_SELECTORS,
  type FormattingSelector,
} from "../data/formattingSelectors";
import { listProfiles, type Profile } from "../../../storage/db";

interface Props {
  editor: Editor | null;
  showFormat: boolean;
  setShowFormat: Dispatch<SetStateAction<boolean>>;
}

export function Toolbar({ editor, showFormat, setShowFormat }: Props) {
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const [people, setPeople] = useState<Profile[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const tagRange = useRef<{ from: number; to: number } | null>(null);

  useEffect(() => {
    if (userPickerOpen && people.length === 0) {
      void listProfiles().then(setPeople).catch(() => {});
    }
  }, [userPickerOpen, people.length]);

  if (!editor) return null;
  if (!showFormat && !userPickerOpen) return null;

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
      {showFormat && (
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
