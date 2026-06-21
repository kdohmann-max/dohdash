import { supabase } from "./client";

// ---- doc comments (see migration 0009_doc_comments) ----

export interface DocComment {
  id: string;
  docId: string;
  parentId: string | null;
  authorId: string | null;
  content: string;
  anchorText: string | null;
  resolvedAt: number | null;
  createdAt: number;
  updatedAt: number | null;
  authorName: string | null;
  authorEmail: string | null;
  authorAvatarUrl: string | null;
}

interface DocCommentRow {
  id: string;
  doc_id: string;
  parent_id: string | null;
  author_id: string | null;
  content: string;
  anchor_text: string | null;
  resolved_at: number | null;
  created_at: number;
  updated_at: number | null;
  author: { display_name: string | null; email: string | null; avatar_url: string | null } | null;
}

function docCommentRowToDocComment(row: DocCommentRow): DocComment {
  return {
    id: row.id,
    docId: row.doc_id,
    parentId: row.parent_id,
    authorId: row.author_id,
    content: row.content,
    anchorText: row.anchor_text,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    authorName: row.author?.display_name ?? null,
    authorEmail: row.author?.email ?? null,
    authorAvatarUrl: row.author?.avatar_url ?? null,
  };
}

export async function listDocComments(docId: string): Promise<DocComment[]> {
  const { data, error } = await supabase
    .from("doc_comments")
    .select("*, author:profiles!author_id(display_name, email, avatar_url)")
    .eq("doc_id", docId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as DocCommentRow[]).map(docCommentRowToDocComment);
}

/**
 * id is supplied by the caller (crypto.randomUUID()) so the editor can place
 * the docComment mark with the same id before the row exists.
 */
export async function createDocComment(comment: {
  id: string;
  docId: string;
  parentId?: string | null;
  authorId: string;
  content: string;
  anchorText?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("doc_comments").insert({
    id: comment.id,
    doc_id: comment.docId,
    parent_id: comment.parentId ?? null,
    author_id: comment.authorId,
    content: comment.content,
    anchor_text: comment.anchorText ?? null,
    resolved_at: null,
    created_at: Date.now(),
    updated_at: null,
  });
  if (error) throw error;
}

export async function updateDocComment(id: string, content: string): Promise<void> {
  const { error } = await supabase
    .from("doc_comments")
    .update({ content, updated_at: Date.now() })
    .eq("id", id);
  if (error) throw error;
}

export async function setDocCommentResolved(id: string, resolved: boolean): Promise<void> {
  const { error } = await supabase
    .from("doc_comments")
    .update({ resolved_at: resolved ? Date.now() : null })
    .eq("id", id);
  if (error) throw error;
}

/** Replies cascade via the parent_id FK. */
export async function deleteDocComment(id: string): Promise<void> {
  const { error } = await supabase.from("doc_comments").delete().eq("id", id);
  if (error) throw error;
}
