import { supabase } from "./client";

// ---- profiles ----

export type Role = "admin" | "member";

export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: Role;
  createdAt: number;
  tenantId: string;
  /** Platform operator flag (cross-tenant). Gates the Operator control plane. */
  superAdmin: boolean;
}

interface ProfileRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: Role;
  created_at: number;
  tenant_id: string;
  super_admin: boolean;
}

function profileRowToProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    role: row.role,
    createdAt: row.created_at,
    tenantId: row.tenant_id,
    superAdmin: row.super_admin ?? false,
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
