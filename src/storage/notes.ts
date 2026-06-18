import { supabase } from "./client";

// ---- notes & folders (the "DohDocs" app — app_id "tasks" in app_access; see migration 0004_notes) ----

export interface DocMeta {
  id: string;
  title: string;
  updatedAt: number;
  folderId: string | null;
  ownerId: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  effectivePermission?: 'owner' | 'edit' | 'comment' | null;
}

export interface DohDoc extends DocMeta {
  markdown: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  ownerId: string | null;
}

interface NoteRow {
  id: string;
  title: string;
  markdown: string;
  updated_at: number;
  folder_id: string | null;
  owner_id: string | null;
  owner?: { display_name: string | null; avatar_url: string | null } | null;
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
  owner_id: string | null;
}

function noteRowToMeta(row: NoteRow): DocMeta {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    folderId: row.folder_id,
    ownerId: row.owner_id,
    ownerName: row.owner?.display_name ?? null,
    ownerAvatarUrl: row.owner?.avatar_url ?? null,
  };
}

function noteRowToDoc(row: NoteRow): DohDoc {
  return { id: row.id, title: row.title, markdown: row.markdown, updatedAt: row.updated_at, folderId: row.folder_id, ownerId: row.owner_id };
}

function docToNoteRow(doc: DohDoc): NoteRow {
  return { id: doc.id, title: doc.title, markdown: doc.markdown, updated_at: doc.updatedAt, folder_id: doc.folderId, owner_id: doc.ownerId };
}

function folderRowToFolder(row: FolderRow): Folder {
  return { id: row.id, name: row.name, parentId: row.parent_id, createdAt: row.created_at, ownerId: row.owner_id ?? null };
}

export async function listDocs(
  query = "",
  view: 'mine' | 'shared' | 'all' = 'all',
  userId?: string
): Promise<DocMeta[]> {
  const q = query.trim();
  let req = supabase
    .from("notes")
    .select("id, title, updated_at, folder_id, owner_id, owner:profiles!owner_id(display_name, avatar_url)")
    .order("updated_at", { ascending: false });

  if (q) req = req.or(`title.ilike.%${q}%,markdown.ilike.%${q}%`);
  if (view === 'mine' && userId) req = req.eq('owner_id', userId);
  else if (view === 'shared' && userId) req = req.neq('owner_id', userId);

  const { data, error } = await req;
  if (error) throw error;

  const metas = (data as unknown as NoteRow[]).map(noteRowToMeta);

  if (userId && (view === 'shared' || view === 'all')) {
    const sharedIds = metas.filter((m) => m.ownerId !== userId).map((m) => m.id);
    if (sharedIds.length > 0) {
      const { data: perms } = await supabase.rpc('get_notes_effective_permissions', {
        p_note_ids: sharedIds,
        p_user_id: userId,
      });
      if (perms) {
        const permMap = new Map(
          (perms as { note_id: string; effective_permission: string }[]).map((p) => [
            p.note_id,
            p.effective_permission as 'owner' | 'edit' | 'comment',
          ])
        );
        return metas.map((m) => ({
          ...m,
          effectivePermission: m.ownerId === userId ? 'owner' : (permMap.get(m.id) ?? null),
        }));
      }
    }
  }

  return metas.map((m) => ({ ...m, effectivePermission: m.ownerId === userId ? 'owner' : null }));
}

/** Upload an image to Supabase Storage and return the public URL. */
export async function uploadImage(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from("doc-images")
    .upload(path, file, { cacheControl: "3600", upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from("doc-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function getDoc(id: string): Promise<DohDoc | undefined> {
  const { data, error } = await supabase.from("notes").select("*").eq("id", id).single();
  if (error) return undefined;
  return noteRowToDoc(data as NoteRow);
}

export async function saveDoc(doc: DohDoc): Promise<void> {
  const { error } = await supabase.from("notes").upsert(docToNoteRow(doc));
  if (error) throw error;
}

export async function deleteDoc(id: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteDocs(ids: string[]): Promise<void> {
  const { error } = await supabase.from("notes").delete().in("id", ids);
  if (error) throw error;
}

export async function createDoc(folderId: string | null = null, ownerId: string | null = null): Promise<DohDoc> {
  const doc: DohDoc = {
    id: crypto.randomUUID(),
    title: "Untitled",
    markdown: "",
    updatedAt: Date.now(),
    folderId,
    ownerId,
  };
  const { error } = await supabase.from("notes").insert(docToNoteRow(doc));
  if (error) throw error;
  return doc;
}

export async function moveDoc(id: string, folderId: string | null): Promise<void> {
  const { error } = await supabase.from("notes").update({ folder_id: folderId }).eq("id", id);
  if (error) throw error;
}

export async function listFolders(): Promise<Folder[]> {
  const { data, error } = await supabase.from("folders").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data as FolderRow[]).map(folderRowToFolder);
}

export async function createFolder(name: string, parentId: string | null = null, ownerId: string | null = null): Promise<Folder> {
  const folder: Folder = { id: crypto.randomUUID(), name, parentId, createdAt: Date.now(), ownerId };
  const { error } = await supabase.from("folders").insert({ id: folder.id, name: folder.name, parent_id: folder.parentId, created_at: folder.createdAt, owner_id: ownerId });
  if (error) throw error;
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("folders").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from("folders").delete().eq("id", id);
  if (error) throw error;
}
