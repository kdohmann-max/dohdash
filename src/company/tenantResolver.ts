// Pure hostname → tenant mapping. No DB, no React — unit-testable.
const ROOT = "dohdash.app";
const DEV_HOSTS = new Set(["localhost", "127.0.0.1"]);

export type TenantResolution =
  | { kind: "subdomain"; value: string }
  | { kind: "custom"; value: string }
  | { kind: "dev"; value: string }
  | { kind: "unknown"; value: null };

export function resolveTenantSlug(hostname: string): TenantResolution {
  if (DEV_HOSTS.has(hostname)) {
    return { kind: "dev", value: import.meta.env.VITE_DEV_TENANT_SLUG ?? "built" };
  }
  if (hostname === ROOT || hostname.endsWith(`.${ROOT}`)) {
    const sub = hostname.slice(0, -ROOT.length - 1);
    if (sub) return { kind: "subdomain", value: sub };
    return { kind: "unknown", value: null };
  }
  return { kind: "custom", value: hostname };
}
