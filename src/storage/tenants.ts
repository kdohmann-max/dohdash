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
