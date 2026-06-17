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

// ---- admin: user removal, activity, audit log (see migration 0008_admin_user_management) ----

/**
 * Full offboarding: deletes the auth.users row, cascading to profiles,
 * app_access, and access_requests. Documents survive (owner_id set to null).
 * The RPC rejects self-removal, so at least one admin always remains.
 */
export async function removeUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("admin_remove_user", { p_user_id: userId });
  if (error) throw error;
}

/** Map of userId -> last sign-in time in ms (null if never recorded). Admin-only. */
export async function listUserActivity(): Promise<Map<string, number | null>> {
  const { data, error } = await supabase.rpc("admin_list_user_activity");
  if (error) throw error;
  const rows = (data ?? []) as { user_id: string; last_sign_in_at: number | null }[];
  return new Map(rows.map((row) => [row.user_id, row.last_sign_in_at]));
}

export type AuditAction =
  | "provision_user"
  | "accept_request"
  | "reject_request"
  | "cancel_pending"
  | "remove_user"
  | "grant_app_access"
  | "revoke_app_access"
  | "change_role";

export interface AuditEntry {
  id: string;
  actorId: string | null;
  action: AuditAction;
  target: string;
  detail: Record<string, unknown> | null;
  createdAt: number;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  action: AuditAction;
  target: string;
  detail: Record<string, unknown> | null;
  created_at: number;
}

/**
 * Client-side audit writes for the admin actions that are direct table
 * writes (grant/revoke app access, role toggle, reject, cancel pending).
 * RPC-backed actions (provision, accept, remove) log inside SQL instead.
 */
export async function logAdminAction(
  actorId: string,
  action: AuditAction,
  target: string,
  detail?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from("admin_audit_log").insert({
    actor_id: actorId,
    action,
    target,
    detail: detail ?? null,
    created_at: Date.now(),
  });
  if (error) throw error;
}

export async function listAuditLog(limit = 200): Promise<AuditEntry[]> {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as AuditRow[]).map((row) => ({
    id: row.id,
    actorId: row.actor_id,
    action: row.action,
    target: row.target,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

// ---- groups (platform-level; reusable by any DohDash app) ----

export interface Group {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: number;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  addedBy: string | null;
  addedAt: number;
}

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: number;
}

interface GroupMemberRow {
  group_id: string;
  user_id: string;
  added_by: string | null;
  added_at: number;
  member: { display_name: string | null; avatar_url: string | null } | null;
}

function groupRowToGroup(row: GroupRow): Group {
  return { id: row.id, name: row.name, description: row.description, createdBy: row.created_by, createdAt: row.created_at };
}

function groupMemberRowToGroupMember(row: GroupMemberRow): GroupMember {
  return {
    groupId: row.group_id,
    userId: row.user_id,
    displayName: row.member?.display_name ?? null,
    avatarUrl: row.member?.avatar_url ?? null,
    addedBy: row.added_by,
    addedAt: row.added_at,
  };
}

export async function listGroups(): Promise<Group[]> {
  const { data, error } = await supabase.from("groups").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data as GroupRow[]).map(groupRowToGroup);
}

export async function createGroup(name: string, description: string | null, createdBy: string): Promise<Group> {
  const group: Group = { id: crypto.randomUUID(), name, description, createdBy, createdAt: Date.now() };
  const { error } = await supabase.from("groups").insert({
    id: group.id, name: group.name, description: group.description,
    created_by: group.createdBy, created_at: group.createdAt,
  });
  if (error) throw error;
  return group;
}

export async function updateGroup(id: string, name: string, description: string | null): Promise<void> {
  const { error } = await supabase.from("groups").update({ name, description }).eq("id", id);
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from("groups").delete().eq("id", id);
  if (error) throw error;
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, user_id, added_by, added_at, member:profiles!user_id(display_name, avatar_url)")
    .eq("group_id", groupId)
    .order("added_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as GroupMemberRow[]).map(groupMemberRowToGroupMember);
}

export async function addGroupMember(groupId: string, userId: string, addedBy: string): Promise<void> {
  const { error } = await supabase.from("group_members").insert({
    group_id: groupId, user_id: userId, added_by: addedBy, added_at: Date.now(),
  });
  if (error) throw error;
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  if (error) throw error;
}

export async function listMyGroups(userId: string): Promise<Group[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("groups(*)")
    .eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as unknown as { groups: GroupRow }[]).map((row) => groupRowToGroup(row.groups));
}

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

// ---- remote claude (see migration 0014_remote_claude) ----

export interface RemoteProject {
  id: string;
  name: string;
  path: string;
  lastSeen: number;
}

export type RemoteSessionStatus = "pending" | "starting" | "running" | "error";

export interface RemoteSession {
  id: string;
  userId: string;
  projectId: string;
  status: RemoteSessionStatus;
  errorMessage: string | null;
  createdAt: number;
  startedAt: number | null;
}

interface RemoteProjectRow {
  id: string;
  name: string;
  path: string;
  last_seen: number;
}

interface RemoteSessionRow {
  id: string;
  user_id: string;
  project_id: string;
  status: RemoteSessionStatus;
  error_message: string | null;
  created_at: number;
  started_at: number | null;
}

function remoteProjectRowToProject(row: RemoteProjectRow): RemoteProject {
  return { id: row.id, name: row.name, path: row.path, lastSeen: row.last_seen };
}

function remoteSessionRowToSession(row: RemoteSessionRow): RemoteSession {
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
  };
}

export async function listRemoteProjects(): Promise<RemoteProject[]> {
  const { data, error } = await supabase
    .from("remote_projects")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as RemoteProjectRow[]).map(remoteProjectRowToProject);
}

export async function createRemoteSession(userId: string, projectId: string): Promise<RemoteSession> {
  const { data, error } = await supabase
    .from("remote_sessions")
    .insert({ user_id: userId, project_id: projectId, created_at: Date.now() })
    .select()
    .single();
  if (error) throw error;
  return remoteSessionRowToSession(data as RemoteSessionRow);
}

export function subscribeToRemoteSession(
  sessionId: string,
  onUpdate: (session: RemoteSession) => void,
): () => void {
  const channel = supabase
    .channel(`remote-session:${sessionId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "remote_sessions", filter: `id=eq.${sessionId}` },
      (payload) => onUpdate(remoteSessionRowToSession(payload.new as RemoteSessionRow)),
    )
    .subscribe();
  return () => { supabase.removeChannel(channel); };
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
  author: { display_name: string | null; avatar_url: string | null } | null;
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
    authorAvatarUrl: row.author?.avatar_url ?? null,
  };
}

export async function listDocComments(docId: string): Promise<DocComment[]> {
  const { data, error } = await supabase
    .from("doc_comments")
    .select("*, author:profiles!author_id(display_name, avatar_url)")
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
