// Cross-tenant isolation suite (the critical release gate).
//
// Seeds a synthetic second tenant ("acme") + a member, plus a member in the
// existing "built" tenant, then signs in AS the acme user (RLS active) and tries
// to read/write every tenant-owned table's "built" rows. Every attempt must come
// back empty / rejected. Any leak exits non-zero.
//
// SAFETY: this script SEEDS data, so it refuses to run against a non-local DB
// unless VERIFY_ALLOW_REMOTE=1 is set (use only against a throwaway prod-clone,
// never production).
//
// Run against local: supabase status -o env > .env.test && node --env-file=.env.test scripts/dev/verify-tenant-isolation.mjs
//   (or pass API_URL/ANON_KEY/SERVICE_ROLE_KEY env vars directly)

import { createClient } from "@supabase/supabase-js";

const url = process.env.API_URL ?? process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anonKey = process.env.ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error("Missing env: need API_URL/ANON_KEY/SERVICE_ROLE_KEY (or VITE_/SUPABASE_ equivalents).");
  process.exit(2);
}

const host = new URL(url).hostname;
const isLocal = host === "127.0.0.1" || host === "localhost";
if (!isLocal && process.env.VERIFY_ALLOW_REMOTE !== "1") {
  console.error(`Refusing to seed a non-local DB (${host}). Set VERIFY_ALLOW_REMOTE=1 to override (prod-clone only!).`);
  process.exit(2);
}

const TENANT_OWNED = [
  "notes", "folders", "doc_comments", "groups", "group_members",
  "note_shares", "folder_shares", "app_access", "profiles",
  "access_requests", "admin_audit_log", "remote_projects", "remote_sessions",
  "pending_profiles",
  "time_entries", "time_jobs", "time_rates",
];

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function tenantId(slug) {
  const { data, error } = await admin.from("tenants").select("id").eq("slug", slug).single();
  if (error) throw new Error(`tenant ${slug}: ${error.message}`);
  return data.id;
}

async function ensureTenant(slug, name) {
  await admin.from("tenants").upsert({ slug, name, config: {}, created_at: 0 }, { onConflict: "slug" });
  return tenantId(slug);
}

// Create (or reuse) an auth user + profile in a tenant, return a signed-in anon client.
async function memberClient(email, tenant) {
  let userId;
  const created = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (created.error) {
    // already exists — look it up
    const { data } = await admin.auth.admin.listUsers();
    userId = data.users.find((u) => u.email === email)?.id;
    if (!userId) throw new Error(`cannot resolve user ${email}: ${created.error.message}`);
  } else {
    userId = created.data.user.id;
  }
  await admin.from("profiles").upsert(
    { id: userId, email, role: "member", created_at: 0, tenant_id: tenant },
    { onConflict: "id" },
  );
  await admin.from("app_access").upsert(
    { user_id: userId, app_id: "tasks", created_at: 0, tenant_id: tenant },
    { onConflict: "user_id,app_id" },
  );

  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (link.error) throw new Error(`generateLink ${email}: ${link.error.message}`);
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const otp = await anon.auth.verifyOtp({ email, token: link.data.properties.email_otp, type: "magiclink" });
  if (otp.error) throw new Error(`verifyOtp ${email}: ${otp.error.message}`);
  return { client: anon, userId };
}

const builtId = await ensureTenant("built", "Doh Built Inc.");
const acmeId = await ensureTenant("acme", "Acme Co");

const built = await memberClient("isolation-built@test.local", builtId);
const acme = await memberClient("isolation-acme@test.local", acmeId);

// Seed one built-owned note so there is a concrete cross-tenant target.
const BUILT_NOTE = "00000000-0000-0000-0000-0000000000b1";
await admin.from("notes").upsert(
  { id: BUILT_NOTE, title: "BUILT secret", markdown: "x", updated_at: 0, owner_id: built.userId, tenant_id: builtId },
  { onConflict: "id" },
);

let failures = 0;
const fail = (msg) => { console.error("  LEAK:", msg); failures++; };
const ok = (msg) => console.log("  ok:", msg);

console.log(`\nActing as ACME user; asserting no visibility of BUILT (tenant ${builtId}) rows:`);
for (const table of TENANT_OWNED) {
  const { data, error } = await acme.client.from(table).select("*").eq("tenant_id", builtId);
  if (error) { fail(`${table}: query errored unexpectedly (${error.message})`); continue; }
  if ((data?.length ?? 0) !== 0) fail(`acme can read ${data.length} built ${table} row(s)`);
  else ok(`${table}: 0 built rows visible`);
}

// Cross-tenant write must be a no-op.
await acme.client.from("notes").update({ title: "HACKED" }).eq("id", BUILT_NOTE);
const { data: after } = await admin.from("notes").select("title").eq("id", BUILT_NOTE).single();
if (after.title !== "BUILT secret") fail(`acme modified built note (title now '${after.title}')`);
else ok("acme UPDATE of built note had no effect");

// Sanity: built user CAN see its own note.
const { data: ownNote } = await built.client.from("notes").select("id").eq("id", BUILT_NOTE);
if ((ownNote?.length ?? 0) !== 1) fail("built user cannot see its own note (over-restrictive)");
else ok("built user sees its own note");

console.log(failures === 0 ? "\nPASS: no cross-tenant leaks.\n" : `\nFAIL: ${failures} leak(s).\n`);
process.exit(failures === 0 ? 0 : 1);
