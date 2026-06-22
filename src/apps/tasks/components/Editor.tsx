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
  getDoc,
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

// Auto-save status shown near the doc title so field users on poor
// connectivity can see their work is safe.
type SaveStatus = "idle" | "saving" | "saved" | "error";

// On save failure we stash the latest markdown locally so a refresh (or a
// closed tab) doesn't lose edits; restored on open if newer than the server.
const BACKUP_PREFIX = "dohdash-doc-backup:";
interface LocalBackup {
  markdown: string;
  updatedAt: number;
}

function readBackup(docId: string): LocalBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_PREFIX + docId);
    return raw ? (JSON.parse(raw) as LocalBackup) : null;
  } catch {
    return null;
  }
}

function writeBackup(docId: string, backup: LocalBackup): void {
  try {
    localStorage.setItem(BACKUP_PREFIX + docId, JSON.stringify(backup));
  } catch {
    // Quota/unavailable — best-effort only.
  }
}

function clearBackup(docId: string): void {
  try {
    localStorage.removeItem(BACKUP_PREFIX + docId);
  } catch {
    // ignore
  }
}

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

  const editorFlushRef = useRef<number | undefined>(undefined);
  const sourceFlushRef = useRef<number | undefined>(undefined);
  const editingTimerRef = useRef<number | undefined>(undefined);
  const dirtyRef = useRef(false);
  const lastUpdatedRef = useRef(note.updatedAt);
  // Retry/backoff for failed saves; pendingMarkdownRef tracks the latest text
  // a retry should attempt (so a stale retry skips itself after a new edit).
  const retryTimerRef = useRef<number | undefined>(undefined);
  const retryAttemptRef = useRef(0);
  const pendingMarkdownRef = useRef<string | null>(null);
  const savedRevertRef = useRef<number | undefined>(undefined);
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

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

  function scheduleRetry(markdown: string) {
    window.clearTimeout(retryTimerRef.current);
    const attempt = (retryAttemptRef.current += 1);
    const delay = Math.min(30000, 1000 * 2 ** (attempt - 1)); // 1s,2s,4s… cap 30s
    retryTimerRef.current = window.setTimeout(() => {
      if (pendingMarkdownRef.current === markdown) flushSave(markdown);
    }, delay);
  }

  function flushSave(markdown: string) {
    dirtyRef.current = false;
    const updatedAt = Date.now();
    lastUpdatedRef.current = updatedAt;
    pendingMarkdownRef.current = markdown;
    window.clearTimeout(savedRevertRef.current);
    setSaveStatus("saving");
    onChangeRef.current(markdown)
      .then(() => {
        // Only resolve to "saved" if no newer edit superseded this attempt.
        if (pendingMarkdownRef.current !== markdown) return;
        retryAttemptRef.current = 0;
        clearBackup(note.id);
        setSaveStatus("saved");
        savedRevertRef.current = window.setTimeout(() => setSaveStatus("idle"), 1500);
      })
      .catch(() => {
        // Stash locally and keep retrying so edits survive a refresh.
        writeBackup(note.id, { markdown, updatedAt });
        setSaveStatus("error");
        scheduleRetry(markdown);
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
        const markdown = getMarkdown(editor);

        // Broadcast and save on single 300ms debounce for live collaboration
        window.clearTimeout(editorFlushRef.current);
        editorFlushRef.current = window.setTimeout(() => {
          channelRef.current?.broadcastTyping({ markdown });
          flushSave(markdown);
        }, 300);
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

    window.clearTimeout(retryTimerRef.current);
    retryAttemptRef.current = 0;
    pendingMarkdownRef.current = null;
    setSaveStatus("idle");

    // Recover unsaved edits from a prior session if the local copy is newer
    // than what the server has, then immediately try to flush it.
    const backup = readBackup(note.id);
    if (backup && backup.updatedAt > note.updatedAt) {
      if (editor) editor.commands.setContent(backup.markdown, { emitUpdate: false });
      setSource(backup.markdown);
      dirtyRef.current = true;
      flushSave(backup.markdown);
    } else if (backup) {
      clearBackup(note.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id, editor]);

  // Tidy timers on unmount.
  useEffect(() => {
    return () => {
      window.clearTimeout(editorFlushRef.current);
      window.clearTimeout(sourceFlushRef.current);
      window.clearTimeout(retryTimerRef.current);
      window.clearTimeout(savedRevertRef.current);
    };
  }, []);

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

  // Broadcast is ephemeral: a backgrounded tab (phone asleep, app switched)
  // drops the WebSocket and misses live updates with no replay. When the tab
  // comes back, pull the latest from the server so the user sees current
  // content without a manual refresh. Skips if local edits are unsaved.
  const refetchingRef = useRef(false);
  useEffect(() => {
    async function refetchIfStale() {
      // focus + visibilitychange both fire on a single resume — guard against
      // the duplicate round-trip. Dirty guard: a resume with unsaved local
      // edits intentionally won't pull remote (don't clobber the user's work).
      if (document.visibilityState === "hidden" || dirtyRef.current || refetchingRef.current) return;
      refetchingRef.current = true;
      try {
        const fresh = await getDoc(note.id);
        if (fresh && fresh.updatedAt > lastUpdatedRef.current) {
          onDocUpdatedRef.current({
            docId: note.id,
            markdown: fresh.markdown,
            updatedAt: fresh.updatedAt,
            senderId: "",
          });
        }
      } catch {
        // best-effort; live broadcast will catch the next edit
      } finally {
        refetchingRef.current = false;
      }
    }
    document.addEventListener("visibilitychange", refetchIfStale);
    window.addEventListener("focus", refetchIfStale);
    return () => {
      document.removeEventListener("visibilitychange", refetchIfStale);
      window.removeEventListener("focus", refetchIfStale);
    };
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
    window.clearTimeout(sourceFlushRef.current);
    flushSave(source);
    setSourceMode(false);
  }

  function onSourceInput(value: string) {
    setSource(value);
    dirtyRef.current = true;
    markEditing();
    window.clearTimeout(sourceFlushRef.current);
    sourceFlushRef.current = window.setTimeout(() => flushSave(value), 400);
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

        {saveStatus !== "idle" ? (
          <span className={`save-status save-status--${saveStatus}`} role="status">
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && "Offline — will retry"}
          </span>
        ) : null}

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
