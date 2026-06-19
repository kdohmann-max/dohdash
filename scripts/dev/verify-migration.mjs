// Migration verifier: asserts the tenancy backfill left no gaps.
//
// For every tenant-owned table: zero rows with a null tenant_id, and prints the
// row count (compare against the pre-migration backup numbers from Phase 0 for
// parity). Read-only — safe to run against any DB (incl. a prod-clone) with the
// service role. Exits non-zero if any null tenant_id remains.
//
// Run against local: supabase status -o env > .env.test && node --env-file=.env.test scripts/dev/verify-migration.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.API_URL ?? process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing env: need API_URL/SERVICE_ROLE_KEY (or VITE_/SUPABASE_ equivalents).");
  process.exit(2);
}

const TENANT_OWNED = [
  "profiles", "app_access", "pending_profiles", "access_requests", "admin_audit_log",
  "notes", "folders", "doc_comments", "groups", "group_members",
  "note_shares", "folder_shares", "remote_projects", "remote_sessions",
];

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

let failures = 0;
console.log("\nTable               total   null tenant_id");
console.log("------------------- ------- --------------");
for (const table of TENANT_OWNED) {
  const total = await admin.from(table).select("*", { count: "exact", head: true });
  const nulls = await admin.from(table).select("*", { count: "exact", head: true }).is("tenant_id", null);
  if (total.error || nulls.error) {
    console.error(`  ${table}: query error (${(total.error ?? nulls.error).message})`);
    failures++;
    continue;
  }
  const nullCount = nulls.count ?? 0;
  if (nullCount > 0) failures++;
  console.log(`${table.padEnd(19)} ${String(total.count ?? 0).padStart(7)} ${String(nullCount).padStart(14)}${nullCount > 0 ? "  <-- LEAK" : ""}`);
}

console.log(failures === 0 ? "\nPASS: no null tenant_id anywhere.\n" : `\nFAIL: ${failures} table(s) with null tenant_id or errors.\n`);
process.exit(failures === 0 ? 0 : 1);
