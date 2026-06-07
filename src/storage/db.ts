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
