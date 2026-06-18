import { supabase } from "./client";

// ---- note & folder shares ----

export type Permission = 'edit' | 'comment';
export type GranteeType = 'user' | 'group';

export interface NoteShare {
  id: string;
  noteId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: Permission;
  grantedBy: string | null;
  createdAt: number;
}

export interface FolderShare {
  id: string;
  folderId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: Permission;
  grantedBy: string | null;
  createdAt: number;
}

export interface ShareTarget {
  id: string;
  type: GranteeType;
  name: string | null;
  avatarUrl: string | null;
}

interface ShareRow {
  id: string;
  note_id?: string;
  folder_id?: string;
  grantee_type: string;
  grantee_id: string;
  permission: string;
  granted_by: string | null;
  created_at: number;
}

export async function listNoteShares(noteId: string): Promise<NoteShare[]> {
  const { data, error } = await supabase
    .from('note_shares')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ShareRow[]).map((row) => ({
    id: row.id,
    noteId: row.note_id!,
    granteeType: row.grantee_type as GranteeType,
    granteeId: row.grantee_id,
    permission: row.permission as Permission,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  }));
}

export async function addNoteShare(
  noteId: string, granteeType: GranteeType, granteeId: string,
  permission: Permission, grantedBy: string
): Promise<void> {
  const { error } = await supabase.from('note_shares').insert({
    id: crypto.randomUUID(), note_id: noteId, grantee_type: granteeType,
    grantee_id: granteeId, permission, granted_by: grantedBy, created_at: Date.now(),
  });
  if (error) throw error;
}

export async function updateNoteShare(id: string, permission: Permission): Promise<void> {
  const { error } = await supabase.from('note_shares').update({ permission }).eq('id', id);
  if (error) throw error;
}

export async function removeNoteShare(id: string): Promise<void> {
  const { error } = await supabase.from('note_shares').delete().eq('id', id);
  if (error) throw error;
}

export async function listFolderShares(folderId: string): Promise<FolderShare[]> {
  const { data, error } = await supabase
    .from('folder_shares')
    .select('*')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ShareRow[]).map((row) => ({
    id: row.id,
    folderId: row.folder_id!,
    granteeType: row.grantee_type as GranteeType,
    granteeId: row.grantee_id,
    permission: row.permission as Permission,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  }));
}

export async function addFolderShare(
  folderId: string, granteeType: GranteeType, granteeId: string,
  permission: Permission, grantedBy: string
): Promise<void> {
  const { error } = await supabase.from('folder_shares').insert({
    id: crypto.randomUUID(), folder_id: folderId, grantee_type: granteeType,
    grantee_id: granteeId, permission, granted_by: grantedBy, created_at: Date.now(),
  });
  if (error) throw error;
}

export async function updateFolderShare(id: string, permission: Permission): Promise<void> {
  const { error } = await supabase.from('folder_shares').update({ permission }).eq('id', id);
  if (error) throw error;
}

export async function removeFolderShare(id: string): Promise<void> {
  const { error } = await supabase.from('folder_shares').delete().eq('id', id);
  if (error) throw error;
}

/** Full-text search across profiles and groups; used by share target type-ahead. */
export async function searchShareTargets(query: string): Promise<ShareTarget[]> {
  const q = query.trim();
  if (!q) return [];
  const [{ data: users }, { data: groups }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, email, avatar_url')
      .or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(5),
    supabase.from('groups').select('id, name').ilike('name', `%${q}%`).limit(5),
  ]);
  return [
    ...((users ?? []) as { id: string; display_name: string | null; email: string; avatar_url: string | null }[]).map(
      (u) => ({ id: u.id, type: 'user' as const, name: u.display_name ?? u.email, avatarUrl: u.avatar_url })
    ),
    ...((groups ?? []) as { id: string; name: string }[]).map(
      (g) => ({ id: g.id, type: 'group' as const, name: g.name, avatarUrl: null })
    ),
  ];
}

/** Returns folder_shares visible to the current user (RLS-filtered). */
export async function listAllVisibleFolderShares(): Promise<FolderShare[]> {
  const { data, error } = await supabase.from('folder_shares').select('*');
  if (error) throw error;
  return ((data ?? []) as ShareRow[]).map((row) => ({
    id: row.id,
    folderId: row.folder_id!,
    granteeType: row.grantee_type as GranteeType,
    granteeId: row.grantee_id,
    permission: row.permission as Permission,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  }));
}
