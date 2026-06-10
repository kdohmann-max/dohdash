import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---- profiles ----

export type Role = "admin" | "member";

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: Role;
  createdAt: number;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: Role;
  created_at: number;
}

function profileRowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
  };
}

/**
 * Returns null when the user genuinely has no profiles row ("not yet
 * provisioned" — PGRST116, the .single() "no rows" code). Throws for any
 * other error (network, RLS denial, etc.) so callers can distinguish
 * "pending access" from "failed to check" — see useAuthState.
 */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return profileRowToProfile(data);
}

export async function listProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(profileRowToProfile);
}

export async function updateProfileRole(userId: string, role: Role): Promise<void> {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) throw error;
}

// ---- app_access ----

export interface AppAccessGrant {
  userId: string;
  appId: string;
  grantedBy: string | null;
  createdAt: number;
}

interface AppAccessRow {
  user_id: string;
  app_id: string;
  granted_by: string | null;
  created_at: number;
}

function appAccessRowToGrant(row: AppAccessRow): AppAccessGrant {
  return {
    userId: row.user_id,
    appId: row.app_id,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  };
}

export async function listAppAccessForUser(userId: string): Promise<AppAccessGrant[]> {
  const { data, error } = await supabase.from("app_access").select("*").eq("user_id", userId);
  if (error) throw error;
  return (data ?? []).map(appAccessRowToGrant);
}

export async function listAllAppAccess(): Promise<AppAccessGrant[]> {
  const { data, error } = await supabase.from("app_access").select("*");
  if (error) throw error;
  return (data ?? []).map(appAccessRowToGrant);
}

export async function grantAppAccess(userId: string, appId: string, grantedBy: string): Promise<void> {
  const { error } = await supabase.from("app_access").insert({
    user_id: userId,
    app_id: appId,
    granted_by: grantedBy,
    created_at: Date.now(),
  });
  if (error) throw error;
}

export async function revokeAppAccess(userId: string, appId: string): Promise<void> {
  const { error } = await supabase.from("app_access").delete().eq("user_id", userId).eq("app_id", appId);
  if (error) throw error;
}

// ---- user provisioning (admin-only; see migration 0003_pending_profiles) ----

export interface PendingProfile {
  email: string;
  role: Role;
  grantedBy: string | null;
  createdAt: number;
}

interface PendingProfileRow {
  email: string;
  role: Role;
  granted_by: string | null;
  created_at: number;
}

function pendingProfileRowToPendingProfile(row: PendingProfileRow): PendingProfile {
  return {
    email: row.email,
    role: row.role,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  };
}

export async function listPendingProfiles(): Promise<PendingProfile[]> {
  const { data, error } = await supabase
    .from("pending_profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(pendingProfileRowToPendingProfile);
}

export async function revokePendingProfile(email: string): Promise<void> {
  const { error } = await supabase.from("pending_profiles").delete().eq("email", email);
  if (error) throw error;
}

/**
 * Grants a person their first access by email alone. Resolves to either an
 * immediate profiles row (if they've already signed in once) or a queued
 * pending_profiles row (picked up automatically on their first sign-in) —
 * see admin_provision_user() in migration 0003_pending_profiles.
 */
export async function provisionUserByEmail(email: string, role: Role): Promise<void> {
  const { error } = await supabase.rpc("admin_provision_user", { p_email: email, p_role: role });
  if (error) throw error;
}

// ---- access requests (self-service onboarding; see migration 0006_access_requests) ----

export interface AccessRequest {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  requestedAt: number;
}

interface AccessRequestRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  requested_at: number;
}

function accessRequestRowToAccessRequest(row: AccessRequestRow): AccessRequest {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    requestedAt: row.requested_at,
  };
}

/**
 * Called from PendingAccessPage when a user lands on the pending-access gate.
 * Upserts so repeat sign-ins (or re-renders) don't create duplicate rows or
 * throw on the existing primary key.
 */
export async function createAccessRequest(req: {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from("access_requests")
    .upsert(
      {
        id: req.id,
        email: req.email,
        display_name: req.displayName,
        avatar_url: req.avatarUrl,
        requested_at: Date.now(),
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function listAccessRequests(): Promise<AccessRequest[]> {
  const { data, error } = await supabase
    .from("access_requests")
    .select("*")
    .order("requested_at", { ascending: true });
  if (error) throw error;
  return (data as AccessRequestRow[]).map(accessRequestRowToAccessRequest);
}

export async function acceptAccessRequest(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_accept_access_request", { p_user_id: userId });
  if (error) throw error;
}

export async function rejectAccessRequest(userId: string): Promise<void> {
  const { error } = await supabase.from("access_requests").delete().eq("id", userId);
  if (error) throw error;
}

// ---- notes & folders (the "DohDocs" app — app_id "tasks" in app_access; see migration 0004_notes) ----

export interface DocMeta {
  id: string;
  title: string;
  updatedAt: number;
  folderId: string | null;
  ownerId: string | null;
}

export interface DohDoc extends DocMeta {
  markdown: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

interface NoteRow {
  id: string;
  title: string;
  markdown: string;
  updated_at: number;
  folder_id: string | null;
  owner_id: string | null;
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
  owner_id?: string | null;
}

function noteRowToMeta(row: NoteRow): DocMeta {
  return { id: row.id, title: row.title, updatedAt: row.updated_at, folderId: row.folder_id, ownerId: row.owner_id };
}

function noteRowToDoc(row: NoteRow): DohDoc {
  return { id: row.id, title: row.title, markdown: row.markdown, updatedAt: row.updated_at, folderId: row.folder_id, ownerId: row.owner_id };
}

function docToNoteRow(doc: DohDoc): NoteRow {
  return { id: doc.id, title: doc.title, markdown: doc.markdown, updated_at: doc.updatedAt, folder_id: doc.folderId, owner_id: doc.ownerId };
}

function folderRowToFolder(row: FolderRow): Folder {
  return { id: row.id, name: row.name, parentId: row.parent_id, createdAt: row.created_at };
}

export async function listDocs(query = ""): Promise<DocMeta[]> {
  const q = query.trim();
  let req = supabase
    .from("notes")
    .select("id, title, updated_at, folder_id, owner_id")
    .order("updated_at", { ascending: false });

  if (q) {
    req = req.or(`title.ilike.%${q}%,markdown.ilike.%${q}%`);
  }

  const { data, error } = await req;
  if (error) throw error;
  return (data as NoteRow[]).map(noteRowToMeta);
}

/** Convert an image file to a base64 data URL so it can be embedded inline. */
export function uploadImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
  const folder: Folder = { id: crypto.randomUUID(), name, parentId, createdAt: Date.now() };
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
