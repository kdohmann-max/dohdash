import { supabase } from "./client";

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
