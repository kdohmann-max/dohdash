// Google-Docs-style comments side panel: threads anchored to text in the
// document (via the docComment mark), with replies, resolve/re-open, and
// delete. Pure presentational — all data fetching and editor mutation live
// in Editor.tsx.

import { useState, type FormEvent } from "react";
import type { DocComment } from "../../../storage/db";
import "./CommentsPanel.css";

export interface ThreadView {
  root: DocComment;
  replies: DocComment[];
  /** The anchored text was edited out of the document. */
  orphaned: boolean;
}

interface Props {
  threads: ThreadView[];
  selfId: string | null;
  isAdmin: boolean;
  activeThreadId: string | null;
  /** A new thread whose mark is placed but whose first comment isn't written yet. */
  pendingThread: { commentId: string; anchorText: string } | null;
  onSubmitNew(content: string): void;
  onCancelNew(): void;
  onReply(rootId: string, content: string): void;
  onResolveToggle(thread: ThreadView): void;
  onDelete(comment: DocComment, isRoot: boolean): void;
  onSelectThread(id: string): void;
  onClose(): void;
}

function authorLabel(comment: DocComment): string {
  if (comment.authorName) return comment.authorName;
  if (comment.authorEmail) return comment.authorEmail;
  return "Removed user";
}

function timeLabel(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Avatar({ comment }: { comment: DocComment }) {
  const label = authorLabel(comment);
  return comment.authorAvatarUrl ? (
    <img className="comment-avatar" src={comment.authorAvatarUrl} alt="" />
  ) : (
    <span className="comment-avatar comment-avatar--placeholder" aria-hidden="true">
      {label.slice(0, 1).toUpperCase()}
    </span>
  );
}

function CommentBody({
  comment,
  canDelete,
  onDelete,
}: {
  comment: DocComment;
  canDelete: boolean;
  onDelete(): void;
}) {
  return (
    <div className="comment-item">
      <Avatar comment={comment} />
      <div className="comment-item-main">
        <div className="comment-item-head">
          <span className="comment-author">{authorLabel(comment)}</span>
          <span className="comment-time">{timeLabel(comment.createdAt)}</span>
        </div>
        <p className="comment-content">{comment.content}</p>
        {canDelete ? (
          <button className="comment-link-btn comment-link-btn--danger" onClick={onDelete}>
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ReplyForm({ onSubmit }: { onSubmit(content: string): void }) {
  const [value, setValue] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  }

  return (
    <form className="comment-reply-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Reply…"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <button type="submit" disabled={!value.trim()}>
        Reply
      </button>
    </form>
  );
}

function Thread({
  thread,
  selfId,
  isAdmin,
  active,
  onReply,
  onResolveToggle,
  onDelete,
  onSelectThread,
}: {
  thread: ThreadView;
  selfId: string | null;
  isAdmin: boolean;
  active: boolean;
  onReply(rootId: string, content: string): void;
  onResolveToggle(thread: ThreadView): void;
  onDelete(comment: DocComment, isRoot: boolean): void;
  onSelectThread(id: string): void;
}) {
  const resolved = thread.root.resolvedAt !== null;
  const canDelete = (comment: DocComment) => isAdmin || (selfId !== null && comment.authorId === selfId);

  return (
    <div
      className={`comment-thread${active ? " comment-thread--active" : ""}${resolved ? " comment-thread--resolved" : ""}`}
      onClick={() => onSelectThread(thread.root.id)}
    >
      {thread.root.anchorText ? (
        <blockquote className="comment-anchor">
          “{thread.root.anchorText}”
          {thread.orphaned ? <span className="comment-orphan-badge">original text removed</span> : null}
        </blockquote>
      ) : null}
      <CommentBody
        comment={thread.root}
        canDelete={canDelete(thread.root)}
        onDelete={() => onDelete(thread.root, true)}
      />
      {thread.replies.length > 0 ? (
        <div className="comment-replies">
          {thread.replies.map((reply) => (
            <CommentBody
              key={reply.id}
              comment={reply}
              canDelete={canDelete(reply)}
              onDelete={() => onDelete(reply, false)}
            />
          ))}
        </div>
      ) : null}
      {!resolved ? <ReplyForm onSubmit={(content) => onReply(thread.root.id, content)} /> : null}
      <div className="comment-thread-actions">
        <button className="comment-link-btn" onClick={() => onResolveToggle(thread)}>
          {resolved ? "Re-open" : "Resolve"}
        </button>
      </div>
    </div>
  );
}

export function CommentsPanel({
  threads,
  selfId,
  isAdmin,
  activeThreadId,
  pendingThread,
  onSubmitNew,
  onCancelNew,
  onReply,
  onResolveToggle,
  onDelete,
  onSelectThread,
  onClose,
}: Props) {
  const [newContent, setNewContent] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const open = threads.filter((t) => t.root.resolvedAt === null);
  const resolved = threads.filter((t) => t.root.resolvedAt !== null);

  function handleSubmitNew(event: FormEvent) {
    event.preventDefault();
    const trimmed = newContent.trim();
    if (!trimmed) return;
    onSubmitNew(trimmed);
    setNewContent("");
  }

  return (
    <aside className="comments-panel">
      <div className="comments-panel-head">
        <h3>Comments</h3>
        <button className="comment-link-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {pendingThread ? (
        <form className="comment-composer" onSubmit={handleSubmitNew}>
          <blockquote className="comment-anchor">“{pendingThread.anchorText}”</blockquote>
          <textarea
            autoFocus
            placeholder="Write a comment…"
            value={newContent}
            onChange={(event) => setNewContent(event.target.value)}
            rows={3}
          />
          <div className="comment-composer-actions">
            <button type="submit" className="comment-primary-btn" disabled={!newContent.trim()}>
              Comment
            </button>
            <button
              type="button"
              className="comment-link-btn"
              onClick={() => {
                setNewContent("");
                onCancelNew();
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {open.length === 0 && !pendingThread ? (
        <p className="comments-empty">No open comments. Select text and use the comment button to start one.</p>
      ) : (
        open.map((thread) => (
          <Thread
            key={thread.root.id}
            thread={thread}
            selfId={selfId}
            isAdmin={isAdmin}
            active={thread.root.id === activeThreadId}
            onReply={onReply}
            onResolveToggle={onResolveToggle}
            onDelete={onDelete}
            onSelectThread={onSelectThread}
          />
        ))
      )}

      {resolved.length > 0 ? (
        <div className="comments-resolved-section">
          <button className="comment-link-btn" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
          </button>
          {showResolved
            ? resolved.map((thread) => (
                <Thread
                  key={thread.root.id}
                  thread={thread}
                  selfId={selfId}
                  isAdmin={isAdmin}
                  active={thread.root.id === activeThreadId}
                  onReply={onReply}
                  onResolveToggle={onResolveToggle}
                  onDelete={onDelete}
                  onSelectThread={onSelectThread}
                />
              ))
            : null}
        </div>
      ) : null}
    </aside>
  );
}
