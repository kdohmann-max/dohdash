import { supabase } from "./client";
import type { Role } from "./profiles";
import { getTenantIdForHost, TENANT_NOT_FOUND } from "./tenants";

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
  // Stamp the tenant of the host the user is requesting access to (they have no
  // profile yet, so tenant_id can't come from current_tenant_id()). Required:
  // access_requests.tenant_id is NOT NULL (migration 0017).
  const tenantId = await getTenantIdForHost(window.location.hostname);
  if (!tenantId) throw new Error(TENANT_NOT_FOUND);

  const { error } = await supabase
    .from("access_requests")
    .upsert(
      {
        id: req.id,
        email: req.email,
        display_name: req.displayName,
        avatar_url: req.avatarUrl,
        requested_at: Date.now(),
        tenant_id: tenantId,
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
