import { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor as TiptapEditor } from "@tiptap/react";
import { buildExtensions } from "../editor/extensions";
import { RESOLVED_META } from "../editor/CommentMark";
import { Toolbar } from "./Toolbar";
import { CommentsPanel, type ThreadView } from "./CommentsPanel";
import { SharePanel } from "./SharePanel";
import { PresenceBar } from "./PresenceBar";
import { exportPdf, copyRichText } from "../share";
import { CommentIcon } from "../../../icons";
import { useAuth } from "../../../auth/AuthContext";
import {
  createDocComment,
  deleteDocComment,
  listDocComments,
  setDocCommentResolved,
  type DocComment,
  type DohDoc,
} from "../../../storage/db";
import {
  subscribeDocChannel,
  type DocChannelHandle,
  type DocPeer,
  type DocUpdatePayload,
} from "../../../storage/realtime";

function getMarkdown(editor: TiptapEditor): string {
  return (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
}

const EDITING_IDLE_MS = 3000;

interface Props {
  note: DohDoc;
  onChange: (markdown: string) => Promise<void>;
  /** A collaborator saved this doc and the local editor was clean — content was applied silently. */
  onRemoteUpdate?: (markdown: string, updatedAt: number) => void;
  onOpenSidebar?: () => void;
}

export function Editor({ note, onChange, onRemoteUpdate, onOpenSidebar }: Props) {
  const { state } = useAuth();
  const self = state.status === "authenticated" ? state.profile : null;

  const saveTimerRef = useRef<number | undefined>(undefined);
  const editingTimerRef = useRef<number | undefined>(undefined);
  const dirtyRef = useRef(false);
  const lastUpdatedRef = useRef(note.updatedAt);
  const channelRef = useRef<DocChannelHandle | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  const [sourceMode, setSourceMode] = useState(false);
  const [source, setSource] = useState(note.markdown);
  const [exportOpen, setExportOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [comments, setComments] = useState<DocComment[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pendingThread, setPendingThread] = useState<{ commentId: string; anchorText: string } | null>(null);

  const [peers, setPeers] = useState<DocPeer[]>([]);
  const [remoteUpdate, setRemoteUpdate] = useState<DocUpdatePayload | null>(null);
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Always call the latest onChange (TasksApp recreates it as `active`
  // changes; the useEditor onUpdate closure is frozen at editor creation).
  const onChangeRef = useRef(onChange);
  const onRemoteUpdateRef = useRef(onRemoteUpdate);
  useEffect(() => {
    onChangeRef.current = onChange;
    onRemoteUpdateRef.current = onRemoteUpdate;
  });

  function markEditing() {
    channelRef.current?.setEditing(true);
    window.clearTimeout(editingTimerRef.current);
    editingTimerRef.current = window.setTimeout(() => channelRef.current?.setEditing(false), EDITING_IDLE_MS);
  }

  function flushSave(markdown: string) {
    dirtyRef.current = false;
    const updatedAt = Date.now();
    lastUpdatedRef.current = updatedAt;
    setSaveError(null);
    onChangeRef.current(markdown).catch((err: unknown) => {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    });
    channelRef.current?.broadcastUpdate({ markdown, updatedAt });
    // A local save makes local state authoritative — the remote change the
    // banner pointed at has been overwritten anyway.
    setRemoteUpdate(null);
  }

  const editor = useEditor(
    {
      extensions: buildExtensions(),
      content: note.markdown,
      onUpdate: ({ editor }) => {
        dirtyRef.current = true;
        markEditing();
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          flushSave(getMarkdown(editor));
        }, 400);
      },
    },
    [note.id]
  );

  const isOwner = note.ownerId === self?.id;
  const isCommentOnly = note.effectivePermission === 'comment';

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!isCommentOnly);
  }, [editor, isCommentOnly]);

  if (import.meta.env.DEV && editor) {
    (window as unknown as { __editor?: unknown }).__editor = editor;
  }

  useEffect(() => {
    if (editor && getMarkdown(editor) !== note.markdown) {
      editor.commands.setContent(note.markdown, { emitUpdate: false });
    }
    setSource(note.markdown);
    setSourceMode(false);
    lastUpdatedRef.current = note.updatedAt;
    dirtyRef.current = false;
    setRemoteUpdate(null);
    setPendingThread(null);
    setActiveThreadId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, editor]);

  // ---- presence + live refresh ----

  function applyRemote(payload: DocUpdatePayload) {
    lastUpdatedRef.current = payload.updatedAt;
    if (editor) {
      const { from, to } = editor.state.selection;
      editor.commands.setContent(payload.markdown, { emitUpdate: false });
      if (!sourceMode) {
        const size = editor.state.doc.content.size;
        editor.commands.setTextSelection({ from: Math.min(from, size), to: Math.min(to, size) });
      }
    }
    setSource(payload.markdown);
    dirtyRef.current = false;
    setRemoteUpdate(null);
    onRemoteUpdateRef.current?.(payload.markdown, payload.updatedAt);
  }

  // The channel lives per doc id; route events through a ref so the handlers
  // always see current state without resubscribing on every render.
  const onDocUpdatedRef = useRef<(payload: DocUpdatePayload) => void>(() => {});
  useEffect(() => {
    onDocUpdatedRef.current = (payload) => {
      if (payload.updatedAt <= lastUpdatedRef.current) return; // stale or echoed
      if (dirtyRef.current) {
        setRemoteUpdate(payload); // unsaved local keystrokes — let the user decide
        return;
      }
      applyRemote(payload);
    };
  });

  useEffect(() => {
    if (!self) return;
    const handle = subscribeDocChannel(note.id, {
      self: {
        userId: self.id,
        name: self.displayName ?? self.email,
        avatarUrl: self.avatarUrl,
      },
      onPeers: setPeers,
      onDocUpdated: (payload) => onDocUpdatedRef.current(payload),
    });
    channelRef.current = handle;
    return () => {
      window.clearTimeout(editingTimerRef.current);
      channelRef.current = null;
      setPeers([]);
      handle.unsubscribe();
    };
    // self is stable for the lifetime of a session
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const remotePeerName = useMemo(() => {
    if (!remoteUpdate) return "";
    return peers.find((peer) => peer.userId === remoteUpdate.senderId)?.name ?? "Someone";
  }, [remoteUpdate, peers]);

  // ---- comments ----

  useEffect(() => {
    let cancelled = false;
    listDocComments(note.id)
      .then((loaded) => {
        if (!cancelled) setComments(loaded);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [note.id]);

  async function refreshComments() {
    setComments(await listDocComments(note.id));
  }

  // Push resolved thread ids into the decoration plugin so resolved anchors
  // drop their highlight without rewriting the document.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const resolved = new Set(
      comments.filter((c) => c.parentId === null && c.resolvedAt !== null).map((c) => c.id),
    );
    editor.view.dispatch(editor.state.tr.setMeta(RESOLVED_META, resolved));
  }, [comments, editor]);

  const threads: ThreadView[] = useMemo(() => {
    const currentMarkdown = editor && !editor.isDestroyed ? getMarkdown(editor) : note.markdown;
    return comments
      .filter((c) => c.parentId === null)
      .map((root) => ({
        root,
        replies: comments.filter((c) => c.parentId === root.id),
        orphaned:
          root.anchorText !== null && !currentMarkdown.includes(`data-comment-id="${root.id}"`),
      }));
    // note.markdown changes after each save, keeping the orphan check fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comments, note.markdown]);

  const openThreadCount = threads.filter((t) => t.root.resolvedAt === null).length;

  function handleAddComment() {
    if (!editor || !self) return;
    const { from, to } = editor.state.selection;
    if (from === to) {
      window.alert("Select some text to comment on first.");
      return;
    }
    // Cancel a previous unsubmitted thread before starting a new one.
    if (pendingThread) editor.commands.unsetDocCommentById(pendingThread.commentId);
    const anchorText = editor.state.doc.textBetween(from, to, " ");
    const commentId = crypto.randomUUID();
    editor.chain().focus().setDocComment(commentId).run();
    setPendingThread({ commentId, anchorText });
    setActiveThreadId(commentId);
    setPanelOpen(true);
  }

  async function handleSubmitNew(content: string) {
    if (!pendingThread || !self) return;
    await createDocComment({
      id: pendingThread.commentId,
      docId: note.id,
      authorId: self.id,
      content,
      anchorText: pendingThread.anchorText,
    });
    setPendingThread(null);
    await refreshComments();
  }

  function handleCancelNew() {
    if (pendingThread) editor?.commands.unsetDocCommentById(pendingThread.commentId);
    setPendingThread(null);
  }

  async function handleReply(rootId: string, content: string) {
    if (!self) return;
    await createDocComment({
      id: crypto.randomUUID(),
      docId: note.id,
      parentId: rootId,
      authorId: self.id,
      content,
    });
    await refreshComments();
  }

  async function handleResolveToggle(thread: ThreadView) {
    await setDocCommentResolved(thread.root.id, thread.root.resolvedAt === null);
    await refreshComments();
  }

  async function handleDeleteComment(comment: DocComment, isRoot: boolean) {
    await deleteDocComment(comment.id);
    if (isRoot) editor?.commands.unsetDocCommentById(comment.id); // dirties doc -> autosave
    if (activeThreadId === comment.id) setActiveThreadId(null);
    await refreshComments();
  }

  function handleSelectThread(id: string) {
    setActiveThreadId(id);
    const span = surfaceRef.current?.querySelector(`[data-comment-id="${id}"]`);
    if (span) {
      span.scrollIntoView({ block: "center", behavior: "smooth" });
      span.classList.add("doc-comment--flash");
      window.setTimeout(() => span.classList.remove("doc-comment--flash"), 1200);
    }
  }

  function handleSurfaceClick(event: React.MouseEvent) {
    const span = (event.target as HTMLElement).closest("[data-comment-id]");
    if (!span) return;
    const id = span.getAttribute("data-comment-id");
    if (id) {
      setActiveThreadId(id);
      setPanelOpen(true);
    }
  }

  // ---- source mode / export (unchanged behavior) ----

  function enterSource() {
    if (editor) setSource(getMarkdown(editor));
    setSourceMode(true);
  }

  function exitSource() {
    if (editor) editor.commands.setContent(source, { emitUpdate: false });
    window.clearTimeout(saveTimerRef.current);
    flushSave(source);
    setSourceMode(false);
  }

  function onSourceInput(value: string) {
    setSource(value);
    dirtyRef.current = true;
    markEditing();
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => flushSave(value), 400);
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

        <PresenceBar peers={peers} />
        <button
          className={`comments-toggle ${panelOpen ? "active" : ""}`}
          onClick={() => setPanelOpen((v) => !v)}
          title="Comments"
        >
          <CommentIcon size={16} />
          {openThreadCount > 0 ? openThreadCount : ""}
        </button>
      </div>

      {saveError ? (
        <div className="editor-remote-banner editor-save-error">
          <span>Save failed: {saveError}</span>
          <button className="banner-dismiss" onClick={() => setSaveError(null)}>✕</button>
        </div>
      ) : null}

      {remoteUpdate ? (
        <div className="editor-remote-banner">
          <span>{remotePeerName} updated this document.</span>
          <button onClick={() => applyRemote(remoteUpdate)}>Reload</button>
          <button className="banner-dismiss" onClick={() => setRemoteUpdate(null)}>
            Keep typing
          </button>
        </div>
      ) : null}

      {sourceMode ? (
        <textarea
          className="source-surface"
          value={source}
          spellCheck={false}
          onChange={(e) => onSourceInput(e.target.value)}
        />
      ) : (
        <>
          <Toolbar
            editor={editor}
            onAddComment={handleAddComment}
            onShareOpen={isOwner ? (() => setSharePanelOpen(true)) : undefined}
            isReadOnly={isCommentOnly}
          />
          {isCommentOnly && (
            <div className="editor-readonly-banner">
              You have comment-only access to this note
            </div>
          )}
          <div className="editor-body">
            <div className="editor-content-wrap" ref={surfaceRef} onClick={handleSurfaceClick}>
              <EditorContent editor={editor} className="editor-surface" />
            </div>
            {panelOpen ? (
              <CommentsPanel
                threads={threads}
                selfId={self?.id ?? null}
                isAdmin={self?.role === "admin"}
                activeThreadId={activeThreadId}
                pendingThread={pendingThread}
                onSubmitNew={(content) => void handleSubmitNew(content)}
                onCancelNew={handleCancelNew}
                onReply={(rootId, content) => void handleReply(rootId, content)}
                onResolveToggle={(thread) => void handleResolveToggle(thread)}
                onDelete={(comment, isRoot) => void handleDeleteComment(comment, isRoot)}
                onSelectThread={handleSelectThread}
                onClose={() => setPanelOpen(false)}
              />
            ) : null}
            {sharePanelOpen && self && (
              <SharePanel
                noteId={note.id}
                ownerName={note.ownerName ?? self.displayName}
                currentUserId={self.id}
                onClose={() => setSharePanelOpen(false)}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
