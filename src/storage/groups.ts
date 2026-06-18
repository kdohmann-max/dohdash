import { supabase } from "./client";

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
