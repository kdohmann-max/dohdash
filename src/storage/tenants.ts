import { supabase } from "./client";
import type { CompanyInfo } from "../company/types";

// Thrown when no tenant matches the current hostname — the caller renders a
// "not set up yet" page rather than the retryable error state.
export const TENANT_NOT_FOUND = "TENANT_NOT_FOUND";

// Fetches the tenant's public branding config via the anon-safe RPC.
// Returns the same shape loadCompanyInfo() used to parse from CompanyInfo.md.
export async function getTenantPublicConfig(hostname: string): Promise<CompanyInfo> {
  const { data, error } = await supabase.rpc("get_tenant_public_config", { p_hostname: hostname });
  if (error) throw error; // network/server error → caller shows retry
  if (!data) throw new Error(TENANT_NOT_FOUND); // no tenant for this host
  return data as CompanyInfo;
}

// Resolves a hostname to its tenant id (anon-safe; id is not sensitive). Returns
// null when no tenant matches the host. Used by the auth guard (compare against
// the signed-in user's tenant) and by access_requests insert (stamp host tenant).
export async function getTenantIdForHost(hostname: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_tenant_id_for_host", { p_hostname: hostname });
  if (error) throw error;
  return (data as string | null) ?? null;
}

// ---- Operator control plane (super-admin only) ----
//
// Cross-tenant reads/writes for the platform operator. Gated server-side by the
// is_super_admin() RLS policies on `tenants` (migration 0024) — a non-super-admin
// session sees nothing here. The operator runs all of this from their OWN host
// (built.dohdash.app); these calls reach OTHER tenants' rows via super-admin RLS.

// Full tenant row (not just the public branding subset the anon RPCs return).
export interface Tenant {
  id: string;
  slug: string;
  customDomain: string | null;
  name: string;
  config: CompanyInfo;
  createdAt: number;
}

interface TenantRow {
  id: string;
  slug: string;
  custom_domain: string | null;
  name: string;
  config: CompanyInfo;
  created_at: number;
}

function tenantRowToTenant(row: TenantRow): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    customDomain: row.custom_domain,
    name: row.name,
    config: row.config,
    createdAt: row.created_at,
  };
}

export interface TenantInput {
  slug: string;
  name: string;
  customDomain: string | null;
  config: CompanyInfo;
}

export async function listTenants(): Promise<Tenant[]> {
  const { data, error } = await supabase.from("tenants").select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => tenantRowToTenant(row as TenantRow));
}

export async function createTenant(input: TenantInput): Promise<Tenant> {
  const { data, error } = await supabase
    .from("tenants")
    .insert({
      slug: input.slug,
      name: input.name,
      custom_domain: input.customDomain,
      config: input.config,
      created_at: Date.now(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return tenantRowToTenant(data as TenantRow);
}

export async function updateTenant(
  id: string,
  patch: Partial<Pick<TenantInput, "slug" | "name" | "customDomain" | "config">>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.slug !== undefined) row.slug = patch.slug;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.customDomain !== undefined) row.custom_domain = patch.customDomain;
  if (patch.config !== undefined) row.config = patch.config;
  const { error } = await supabase.from("tenants").update(row).eq("id", id);
  if (error) throw error;
}

// Provision a NEW tenant's first admin (cross-tenant — see RPC in 0024). The
// pending row promotes to an admin profile on that admin's first Google sign-in.
export async function provisionFirstAdmin(tenantId: string, email: string): Promise<void> {
  const { error } = await supabase.rpc("super_admin_provision_first_admin", {
    p_tenant_id: tenantId,
    p_email: email,
  });
  if (error) throw error;
}
