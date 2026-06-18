import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import { buildExtensions } from "../editor/extensions";
import { Toolbar } from "./Toolbar";
import { exportPdf, copyRichText } from "../share";
import type { DohDoc } from "../../../storage/db";

function getMarkdown(editor: TiptapEditor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

interface Props {
  note: DohDoc;
  onChange: (markdown: string) => void;
  onOpenSidebar?: () => void;
}

export function Editor({ note, onChange, onOpenSidebar }: Props) {
  const saveTimerRef = useRef<number | undefined>(undefined);
  const [sourceMode, setSourceMode] = useState(false);
  const [source, setSource] = useState(note.markdown);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const editor = useEditor(
    {
      extensions: buildExtensions(),
      content: note.markdown,
      onUpdate: ({ editor }) => {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          onChange(getMarkdown(editor));
        }, 400);
      },
    },
    [note.id]
  );

  if (import.meta.env.DEV && editor) {
    (window as unknown as { __editor?: unknown }).__editor = editor;
  }

  useEffect(() => {
    if (editor && getMarkdown(editor) !== note.markdown) {
      editor.commands.setContent(note.markdown, { emitUpdate: false });
    }
    setSource(note.markdown);
    setSourceMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, editor]);

  function enterSource() {
    if (editor) setSource(getMarkdown(editor));
    setSourceMode(true);
  }

  function exitSource() {
    if (editor) editor.commands.setContent(source, { emitUpdate: false });
    onChange(source);
    setSourceMode(false);
  }

  function onSourceInput(value: string) {
    setSource(value);
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => onChange(value), 400);
  }

  async function shareRichText() {
    if (editor) {
      const ok = await copyRichText(editor);
      setCopied(ok);
      setTimeout(() => setCopied(false), 1800);
    }
    setExportOpen(false);
  }

  function sharePdf() {
    if (editor) exportPdf(editor, note.title || "DohDocs");
    setExportOpen(false);
  }

  return (
    <div className="editor">
      <div className="view-toggle">
        <button className="menu-btn" onClick={onOpenSidebar} title="Open menu">☰</button>
        <button className={!sourceMode ? "active" : ""} onClick={() => sourceMode ? exitSource() : undefined} title="Rich text view">
          Rich
        </button>
        <button className={sourceMode ? "active" : ""} onClick={() => !sourceMode ? enterSource() : undefined} title="Markdown source">
          {"</> MD"}
        </button>

        <button className="print-btn" onClick={sharePdf} title="Print / Save as PDF">
          <svg width="16" height="16" aria-hidden="true"><use href="/icons.svg#printer-icon" /></svg>
        </button>

        <div className="share-wrap">
          <button className={`share-btn ${exportOpen ? "active" : ""}`} onClick={() => setExportOpen((v) => !v)} title="Export">
            {copied ? "Copied ✓" : "Export ▾"}
          </button>
          {exportOpen && (
            <div className="share-menu" onMouseLeave={() => setExportOpen(false)}>
              <button onClick={sharePdf}>PDF</button>
              <button onClick={shareRichText}>Rich Text (copy)</button>
            </div>
          )}
        </div>
      </div>

      {sourceMode ? (
        <textarea
          className="source-surface"
          value={source}
          spellCheck={false}
          onChange={(e) => onSourceInput(e.target.value)}
        />
      ) : (
        <>
          <Toolbar editor={editor} />
          <EditorContent editor={editor} className="editor-surface" />
        </>
      )}
    </div>
  );
}
