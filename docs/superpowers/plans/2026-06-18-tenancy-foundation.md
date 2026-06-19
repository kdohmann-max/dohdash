# Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert single-tenant DohDash into a shared multi-tenant platform and migrate the existing Doh Built Inc. data in as tenant #1, with zero data/permission/style loss.

**Architecture:** One Vercel deployment + one Supabase project serve all customers. A `tenants` table holds per-customer config; every tenant-owned table gets `tenant_id`; RLS scopes all access via a `current_tenant_id()` helper. The app resolves tenant from hostname and loads its public config (replacing the runtime `CompanyInfo.md` fetch).

**Tech Stack:** Supabase Postgres + RLS, `@supabase/supabase-js`, React 19 + TS + Vite, Vitest, Playwright (dev auth bypass).

**Spec:** `docs/superpowers/specs/2026-06-18-tenancy-foundation-design.md`

## Global Constraints

- **NEVER `git commit`/`git push`/`supabase db push` without explicit user approval** — a push to `master` triggers a live Vercel prod deploy (CLAUDE.md). Commits in this plan are staged locally; the user approves the actual DB push and deploy.
- **All Supabase DB access stays in `src/storage/` only** (one-client rule). New tenant reads live in `src/storage/tenants.ts`.
- **No hardcoded colors/px; shared icons only** (`.claude/context/styleguide.md`).
- **`npm run build` (`tsc -b` then Vite) must pass before any phase is "done".**
- **Migrations are additive only** — new tables/columns/policies; never drop or destructively rewrite an existing column. Each migration file is sequential (`0016_…`, `0017_…`).
- **Tenant #1 = Doh Built Inc., `slug = 'built'`.** Its config is transcribed from the current `public/CompanyInfo.md`.
- **Migration column order is law:** add column nullable → backfill → set NOT NULL → add RLS predicate. Never reorder.

## Phase / session map (run each phase as its own fresh session)

| Phase | Deliverable | Recommended model |
|-------|-------------|-------------------|
| 0 | Backup + working branch | Sonnet |
| 1 | `tenants` table, `current_tenant_id()`, nullable `tenant_id` columns, seed tenant #1 | Opus |
| 2 | Backfill + NOT NULL + FKs | Opus |
| 3 | RLS tenant predicates + `SECURITY DEFINER` function hardening | **Opus (highest risk)** |
| 4 | Public-config RPC + tenant resolution + config loader swap | Sonnet |
| 5 | Auth/provisioning tenant binding | Opus |
| 6 | Cross-tenant isolation test suite + migration verify script | Opus |
| 7 | Context-doc updates | Sonnet |

Tables in scope (tenant-owned): `profiles`, `app_access`, `pending_profiles`, `access_requests`, `admin_audit_log`, `notes`, `folders`, `doc_comments`, `groups`, `group_members`, `note_shares`, `folder_shares`, `remote_projects`, `remote_sessions`. **Out of scope (stays global):** `scratch_cache`.

---

## PHASE 0 — Backup & branch

### Task 0: Snapshot and branch

**Files:** none (ops only).

- [ ] **Step 1: Create a working branch**

```bash
git checkout -b tenancy-foundation
```

- [ ] **Step 2: Take a Supabase backup (REQUIRED GATE — do not skip)**

Ask the user to confirm a fresh snapshot exists before any schema change. Document the method in the commit message. Either:
- Supabase Dashboard → Database → Backups → "Create backup", **or**
- `supabase db dump --db-url "$SUPABASE_DB_URL" -f backups/pre-tenancy-$(date +%Y%m%d).sql`

Expected: a restorable backup dated today. **Do not proceed to Phase 1 until the user confirms.**

- [ ] **Step 3: Commit the (empty) branch marker / backup file if dumped**

```bash
git add backups/ 2>/dev/null; git commit -m "chore: snapshot before tenancy migration" --allow-empty
```

---

## PHASE 1 — Schema: tenants table + tenant_id columns (nullable)

**Migration file:** `supabase/migrations/0016_tenancy_schema.sql`

**Interfaces produced (later phases rely on these exact names):**
- Table `public.tenants(id uuid, slug text, custom_domain text, name text, config jsonb, created_at bigint)`
- Function `public.current_tenant_id() returns uuid`
- Column `tenant_id uuid` (nullable in this phase) on all 14 tenant-owned tables.

- [ ] **Step 1: Write the migration — tenants table + helper + nullable columns + seed**

Create `supabase/migrations/0016_tenancy_schema.sql`:

```sql
-- Multi-tenant foundation. Additive only: new table, new helper, nullable
-- tenant_id columns. Backfill + NOT NULL + RLS happen in 0017/0018 — in that
-- order, so we never lock ourselves out of existing data mid-migration.

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  custom_domain text unique,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  created_at bigint not null
);

alter table public.tenants enable row level security;

-- Returns the calling user's tenant. SECURITY DEFINER to avoid RLS recursion,
-- mirroring is_admin() in 0001.
create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select tenant_id from public.profiles where id = auth.uid();
$$;

-- Seed tenant #1 = Doh Built Inc. config is transcribed from the CURRENT
-- public/CompanyInfo.md at implementation time (see Step 2).
insert into public.tenants (slug, custom_domain, name, config, created_at)
values ('built', null, 'Doh Built Inc.', '{}'::jsonb, extract(epoch from now())::bigint);

-- Add tenant_id nullable to every tenant-owned table.
alter table public.profiles          add column tenant_id uuid references public.tenants(id);
alter table public.app_access        add column tenant_id uuid references public.tenants(id);
alter table public.pending_profiles  add column tenant_id uuid references public.tenants(id);
alter table public.access_requests   add column tenant_id uuid references public.tenants(id);
alter table public.admin_audit_log   add column tenant_id uuid references public.tenants(id);
alter table public.notes             add column tenant_id uuid references public.tenants(id);
alter table public.folders           add column tenant_id uuid references public.tenants(id);
alter table public.doc_comments      add column tenant_id uuid references public.tenants(id);
alter table public.groups            add column tenant_id uuid references public.tenants(id);
alter table public.group_members     add column tenant_id uuid references public.tenants(id);
alter table public.note_shares       add column tenant_id uuid references public.tenants(id);
alter table public.folder_shares     add column tenant_id uuid references public.tenants(id);
alter table public.remote_projects   add column tenant_id uuid references public.tenants(id);
alter table public.remote_sessions   add column tenant_id uuid references public.tenants(id);
```

> NOTE: if any of these tables doesn't exist with that exact name, stop and grep `supabase/migrations/` for the real `create table` — do not invent columns.

- [ ] **Step 2: Transcribe Doh Built config into the seed row**

Read `public/CompanyInfo.md`, parse its frontmatter (styleGuide, appNames, adminContact, logo) + about body, and replace the `'{}'::jsonb` seed value with the real JSON object matching the `CompanyInfo` TS type (`src/company/types.ts`). Keep keys identical to that type so the loader (Phase 4) is a drop-in.

- [ ] **Step 3: Apply to a NON-PROD target and verify**

Run against a local Supabase or a Supabase **branch** DB (never prod yet):
```bash
supabase db push --db-url "$SUPABASE_TEST_DB_URL"
```
Then verify:
```sql
select count(*) from public.tenants;                 -- expect 1
select slug, name from public.tenants;               -- expect built / Doh Built Inc.
select column_name from information_schema.columns
  where table_name='notes' and column_name='tenant_id'; -- expect 1 row
```
Expected: tenants has the seed row; `tenant_id` exists and is nullable on all 14 tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0016_tenancy_schema.sql
git commit -m "feat(tenancy): tenants table, current_tenant_id(), nullable tenant_id columns"
```

---

## PHASE 2 — Backfill + NOT NULL

**Migration file:** `supabase/migrations/0017_tenancy_backfill.sql`

**Interfaces consumed:** `public.tenants` row for `slug='built'`; nullable `tenant_id` columns from Phase 1.
**Interfaces produced:** `tenant_id` is `NOT NULL` on all 14 tables, every existing row stamped to tenant #1.

- [ ] **Step 1: Write the backfill migration**

Create `supabase/migrations/0017_tenancy_backfill.sql`:

```sql
-- Stamp all existing rows to tenant #1 (Doh Built), THEN enforce NOT NULL.
-- Order matters: backfill before NOT NULL or the constraint rejects existing rows.

do $$
declare built uuid;
begin
  select id into built from public.tenants where slug = 'built';

  update public.profiles         set tenant_id = built where tenant_id is null;
  update public.app_access       set tenant_id = built where tenant_id is null;
  update public.pending_profiles set tenant_id = built where tenant_id is null;
  update public.access_requests  set tenant_id = built where tenant_id is null;
  update public.admin_audit_log  set tenant_id = built where tenant_id is null;
  update public.notes            set tenant_id = built where tenant_id is null;
  update public.folders          set tenant_id = built where tenant_id is null;
  update public.doc_comments     set tenant_id = built where tenant_id is null;
  update public.groups           set tenant_id = built where tenant_id is null;
  update public.group_members    set tenant_id = built where tenant_id is null;
  update public.note_shares      set tenant_id = built where tenant_id is null;
  update public.folder_shares    set tenant_id = built where tenant_id is null;
  update public.remote_projects  set tenant_id = built where tenant_id is null;
  update public.remote_sessions  set tenant_id = built where tenant_id is null;
end $$;

alter table public.profiles         alter column tenant_id set not null;
alter table public.app_access       alter column tenant_id set not null;
alter table public.pending_profiles alter column tenant_id set not null;
alter table public.access_requests  alter column tenant_id set not null;
alter table public.admin_audit_log  alter column tenant_id set not null;
alter table public.notes            alter column tenant_id set not null;
alter table public.folders          alter column tenant_id set not null;
alter table public.doc_comments     alter column tenant_id set not null;
alter table public.groups           alter column tenant_id set not null;
alter table public.group_members    alter column tenant_id set not null;
alter table public.note_shares      alter column tenant_id set not null;
alter table public.folder_shares    alter column tenant_id set not null;
alter table public.remote_projects  alter column tenant_id set not null;
alter table public.remote_sessions  alter column tenant_id set not null;

-- Helpful indexes for tenant-scoped reads.
create index on public.notes (tenant_id);
create index on public.folders (tenant_id);
create index on public.app_access (tenant_id);
create index on public.profiles (tenant_id);
```

- [ ] **Step 2: Apply to the non-prod target and verify zero nulls + parity**

```sql
-- Every table: no null tenant_id remains.
select 'notes' t, count(*) c from public.notes where tenant_id is null
union all select 'profiles', count(*) from public.profiles where tenant_id is null;
-- ...repeat per table; ALL counts must be 0.

-- Row-count parity vs pre-migration (compare to numbers captured in Phase 0).
select count(*) from public.notes;
```
Expected: every `tenant_id is null` count is 0; total row counts unchanged from the backup.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0017_tenancy_backfill.sql
git commit -m "feat(tenancy): backfill tenant_id to tenant #1 and enforce NOT NULL"
```

---

## PHASE 3 — RLS tenant predicates + SECURITY DEFINER hardening (HIGHEST RISK)

**Migration file:** `supabase/migrations/0018_tenancy_rls.sql`

**Goal:** every policy on every tenant-owned table also requires `tenant_id = current_tenant_id()`, and every `SECURITY DEFINER` function enforces tenancy. After this, no session can read or write across tenants.

**Approach (repeatable procedure per table):** for each existing policy, recreate it with the tenant predicate ANDed into both `using` and `with check`. Existing owner/share/admin logic is preserved verbatim; the tenant clause is layered on. Below are the concrete recreations for the representative tables; apply the **same pattern** to the remaining tables, reading each table's current policies from its migration file first.

- [ ] **Step 1: Harden the SECURITY DEFINER functions**

Add tenant scoping so a `DEFINER` function (which bypasses RLS) can't leak across tenants. In `0018_tenancy_rls.sql`:

```sql
-- is_admin already scopes to the caller's own profile row, which carries the
-- caller's tenant — so "admin" is implicitly admin-of-own-tenant. No change
-- needed to is_admin() itself; the tenant wall is enforced by the policies
-- that ALSO require tenant_id = current_tenant_id() on the TARGET row (below).

-- resolve_note_permission: add an explicit tenant guard so a passed-in note_id
-- from another tenant resolves to null even though the function is DEFINER.
create or replace function public.resolve_note_permission(p_note_id uuid, p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  with
  note_info as (
    select owner_id, folder_id, tenant_id from public.notes where id = p_note_id
  ),
  caller_tenant as (
    select tenant_id from public.profiles where id = p_user_id
  ),
  user_groups as (
    select group_id from public.group_members where user_id = p_user_id
  ),
  note_grants as (
    select permission from public.note_shares
    where note_id = p_note_id
      and ((grantee_type='user' and grantee_id=p_user_id)
        or (grantee_type='group' and grantee_id in (select group_id from user_groups)))
  ),
  folder_grants as (
    select fs.permission from public.folder_shares fs
    join note_info ni on ni.folder_id = fs.folder_id
    where (fs.grantee_type='user' and fs.grantee_id=p_user_id)
       or (fs.grantee_type='group' and fs.grantee_id in (select group_id from user_groups))
  )
  select case
    -- Tenant guard: caller and note must share a tenant, else no access.
    when (select tenant_id from note_info) is distinct from (select tenant_id from caller_tenant) then null
    when (select owner_id from note_info) = p_user_id then 'owner'
    when exists (select 1 from note_grants)
      then case when 'edit' in (select permission from note_grants) then 'edit' else 'comment' end
    when exists (select 1 from folder_grants)
      then case when 'edit' in (select permission from folder_grants) then 'edit' else 'comment' end
    else null
  end
$$;
```

> `get_notes_effective_permissions` calls `resolve_note_permission` so it inherits the guard — no change needed.

- [ ] **Step 2: Recreate profiles policies with tenant predicate**

```sql
drop policy if exists "profiles: read own row" on public.profiles;
drop policy if exists "profiles: admins manage all" on public.profiles;

create policy "profiles: read own row"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: read same-tenant rows"
  on public.profiles for select
  using (tenant_id = public.current_tenant_id());

create policy "profiles: admins manage same-tenant"
  on public.profiles for all
  using (public.is_admin() and tenant_id = public.current_tenant_id())
  with check (public.is_admin() and tenant_id = public.current_tenant_id());
```

> Rationale: share-target search needs same-tenant profile visibility (today any authed user could read all profiles; now scoped to tenant). Admin management is tenant-bounded.

- [ ] **Step 3: Recreate notes policies with tenant predicate**

```sql
drop policy if exists "notes: owner or shared can select"      on public.notes;
drop policy if exists "notes: app members can insert own notes" on public.notes;
drop policy if exists "notes: owner or editor can update"       on public.notes;
drop policy if exists "notes: owner can delete"                 on public.notes;

create policy "notes: owner or shared can select"
  on public.notes for select
  using (tenant_id = public.current_tenant_id()
         and public.resolve_note_permission(id, auth.uid()) is not null);

create policy "notes: app members can insert own notes"
  on public.notes for insert
  with check (tenant_id = public.current_tenant_id()
              and public.has_app_access('tasks') and auth.uid() = owner_id);

create policy "notes: owner or editor can update"
  on public.notes for update
  using (tenant_id = public.current_tenant_id()
         and public.resolve_note_permission(id, auth.uid()) in ('owner','edit'));

create policy "notes: owner can delete"
  on public.notes for delete
  using (tenant_id = public.current_tenant_id() and auth.uid() = owner_id);
```

- [ ] **Step 4: Recreate folders, note_shares, folder_shares policies**

Apply the identical "AND tenant_id = current_tenant_id()" transform to each policy currently defined in `0011_note_sharing.sql` (folders select/insert/update/delete; note_shares select/insert/update/delete; folder_shares select/insert/update/delete). For INSERT policies add it to `with check`; for SELECT/UPDATE/DELETE add it to `using`. Preserve every existing owner/grantee clause verbatim — only AND the tenant clause on.

- [ ] **Step 5: Recreate the remaining tables' policies**

For each of `app_access`, `pending_profiles`, `access_requests`, `admin_audit_log`, `doc_comments`, `groups`, `group_members`, `remote_projects`, `remote_sessions`: open its migration file, read its current policies, and recreate each with the tenant predicate ANDed in (same procedure as Steps 2–4). Do not skip a table — a missed table is a cross-tenant leak.

- [ ] **Step 6: Apply to non-prod and smoke-test single-tenant still works**

Using the dev auth bypass (`npm run auth:mint`) against the test DB, confirm Doh Built's existing flows still work end-to-end: open DohDocs, list docs, edit, share, comment. Expected: identical behavior to before (one tenant, full access).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0018_tenancy_rls.sql
git commit -m "feat(tenancy): tenant-scope all RLS policies and SECURITY DEFINER functions"
```

---

## PHASE 4 — Public-config RPC + tenant resolution + config loader

**Files:**
- Create: `supabase/migrations/0019_tenant_public_config.sql`
- Create: `src/storage/tenants.ts`
- Create: `src/company/tenantResolver.ts`
- Create: `src/company/tenantResolver.test.ts`
- Modify: `src/company/companyInfo.ts` (the `loadCompanyInfo` source)
- Modify: `.env.local` (add `VITE_DEV_TENANT_SLUG=built`)

**Interfaces produced:**
- RPC `get_tenant_public_config(p_hostname text) returns jsonb` (anon-callable)
- `resolveTenantSlug(hostname: string): TenantResolution`
- `getTenantPublicConfig(hostname: string): Promise<CompanyInfo>` in `src/storage/tenants.ts`

- [ ] **Step 1: Write the public-config RPC migration**

```sql
-- Anon-callable: returns ONLY the safe branding subset for the landing/login
-- page, resolved by hostname (subdomain slug or custom domain). Never returns
-- anything sensitive — it is exposed to unauthenticated visitors.
create or replace function public.get_tenant_public_config(p_hostname text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select t.config
  from public.tenants t
  where t.custom_domain = p_hostname
     or t.slug = split_part(p_hostname, '.', 1)
  limit 1;
$$;

grant execute on function public.get_tenant_public_config(text) to anon, authenticated;
```

- [ ] **Step 2: Write the failing resolver test**

Create `src/company/tenantResolver.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveTenantSlug } from "./tenantResolver";

describe("resolveTenantSlug", () => {
  it("reads a subdomain slug", () => {
    expect(resolveTenantSlug("built.dohdash.app")).toEqual({ kind: "subdomain", value: "built" });
  });
  it("recognizes a custom domain (not a *.dohdash.app host)", () => {
    expect(resolveTenantSlug("app.acmebuilt.com")).toEqual({ kind: "custom", value: "app.acmebuilt.com" });
  });
  it("falls back to dev tenant on localhost", () => {
    expect(resolveTenantSlug("localhost")).toEqual({ kind: "dev", value: "built" });
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

Run: `npx vitest run src/company/tenantResolver.test.ts`
Expected: FAIL — `resolveTenantSlug` not found.

- [ ] **Step 4: Implement the resolver**

Create `src/company/tenantResolver.ts`:

```ts
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
```

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx vitest run src/company/tenantResolver.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Add the storage module**

Create `src/storage/tenants.ts`:

```ts
import { supabase } from "./client";
import type { CompanyInfo } from "../company/types";

// Fetches the tenant's public branding config via the anon-safe RPC.
// Returns the same shape loadCompanyInfo() used to parse from CompanyInfo.md.
export async function getTenantPublicConfig(hostname: string): Promise<CompanyInfo> {
  const { data, error } = await supabase.rpc("get_tenant_public_config", { p_hostname: hostname });
  if (error) throw error;             // network/server error → caller shows retry
  if (!data) throw new Error("TENANT_NOT_FOUND");  // no tenant for this host
  return data as CompanyInfo;
}
```

> If `src/storage/client.ts` doesn't exist yet (db.ts not split — Phase 3 of the platform-refactor plan), import `supabase` from `./db` instead and note it for the future split.

- [ ] **Step 7: Swap the loader source**

Modify `src/company/companyInfo.ts` `loadCompanyInfo()` to call `getTenantPublicConfig(window.location.hostname)` instead of `fetch("/CompanyInfo.md")`. Keep the return type `CompanyInfo` and leave `applyCompanyTheme()` untouched. Map the `TENANT_NOT_FOUND` error to a distinct value the caller can render as the "not set up yet" page; let other errors surface as the retryable error state (mirrors `useAuthState`'s pending-vs-error split).

- [ ] **Step 8: Build + smoke test**

Run: `npm run build` → clean. With `VITE_DEV_TENANT_SLUG=built` and the test DB, `npm run dev` should theme exactly as today (config now from DB row, not the file).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0019_tenant_public_config.sql src/storage/tenants.ts src/company/tenantResolver.ts src/company/tenantResolver.test.ts src/company/companyInfo.ts
git commit -m "feat(tenancy): hostname-resolved public config RPC + loader swap"
```

---

## PHASE 5 — Auth / provisioning tenant binding

**Files:**
- Create: `supabase/migrations/0020_tenant_provisioning.sql`
- Modify: provisioning RPCs (`admin_provision_user`, `handle_new_user` trigger) — read current defs from `0003_pending_profiles.sql` / `0008_admin_user_management.sql` first.
- Modify: `src/auth/useAuthState.ts` (tenant-mismatch → signed-out for this host)

**Interfaces consumed:** `current_tenant_id()`, `tenants`, resolver from Phase 4.

- [ ] **Step 1: Write the provisioning migration**

Update `admin_provision_user` to stamp the new `profiles`/`pending_profiles` row with the **calling admin's** `tenant_id` (`current_tenant_id()`), and update `handle_new_user` to copy `tenant_id` from the matching `pending_profiles` row on first sign-in. Add a `super_admin boolean not null default false` column to `profiles` (reserved for the operator; not used by app logic yet):

```sql
alter table public.profiles add column super_admin boolean not null default false;
-- (admin_provision_user / handle_new_user bodies recreated here with tenant_id
--  stamping — transcribe the existing body and add: tenant_id := current_tenant_id())
```

- [ ] **Step 2: Enforce host/tenant match in the client auth state**

In `src/auth/useAuthState.ts`, after the profile loads, compare `profile.tenant_id` against the tenant resolved from `window.location.hostname` (Phase 4 resolver → look up its id). On mismatch, treat as `signed-out` for this host (the user isn't a member here). Add a unit case to the existing `deriveAuthState` tests for the mismatch branch.

- [ ] **Step 3: Build + test both paths**

Run: `npm run build` (clean) and `npx vitest run src/auth`. Mint two tenants' sessions (Phase 6 helper) and confirm a tenant-1 user on a tenant-2 host is signed-out, while on their own host they authenticate.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0020_tenant_provisioning.sql src/auth/useAuthState.ts src/auth/*.test.*
git commit -m "feat(tenancy): tenant-scoped provisioning + host/tenant auth guard"
```

---

## PHASE 6 — Cross-tenant isolation suite + migration verify script

**Files:**
- Create: `scripts/dev/verify-tenant-isolation.mjs`
- Create: `scripts/dev/verify-migration.mjs`
- Modify: `package.json` (auth:mint extension for a 2nd tenant; add `verify:isolation`, `verify:migration` scripts)

- [ ] **Step 1: Seed a second synthetic tenant + two users in the test DB**

Add a script step that inserts tenant `acme` and a member user in it (service-role), plus a member in `built`. Mint a session for each (extend `npm run auth:mint` to take a user email).

- [ ] **Step 2: Write the isolation assertions (the critical gate)**

Create `scripts/dev/verify-tenant-isolation.mjs`: signed in as the `acme` user, attempt to SELECT/INSERT/UPDATE/DELETE rows belonging to `built` for **every** tenant-owned table. Each must return zero rows / be rejected.

```js
// Pseudocode shape — one assertion block per table.
// Using the acme user's anon client (RLS active):
const { data } = await acme.from("notes").select("*").eq("tenant_id", BUILT_ID);
assert(data.length === 0, "LEAK: acme can read built notes");
// repeat for folders, doc_comments, groups, group_members, note_shares,
// folder_shares, app_access, profiles, access_requests, admin_audit_log,
// remote_projects, remote_sessions, pending_profiles.
```

- [ ] **Step 3: Run it, expect all-pass on the migrated DB**

Run: `node --env-file=.env.local scripts/dev/verify-tenant-isolation.mjs`
Expected: every table reports 0 cross-tenant rows; any non-zero is a FAIL that blocks release.

- [ ] **Step 4: Write the migration verify script**

Create `scripts/dev/verify-migration.mjs`: assert no `tenant_id is null` anywhere, row-count parity against numbers captured in Phase 0, and that Doh Built docs/permissions/groups still resolve for a built user.

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/verify-tenant-isolation.mjs scripts/dev/verify-migration.mjs package.json
git commit -m "test(tenancy): cross-tenant isolation suite + migration verify script"
```

---

## PHASE 7 — Context docs

- [ ] **Step 1: Update `.claude/context/dohdash.md`** — add a "Multi-tenancy" section: `tenants` table, `current_tenant_id()`, the tenant predicate on every policy, hostname resolution, config-from-DB (CompanyInfo.md now a seed template), tenant-scoped provisioning.

- [ ] **Step 2: Update `CLAUDE.md`** — note DohDash is multi-tenant; new tables get `tenant_id` + the tenant RLS predicate by default; `scratch_cache` is the documented global exception.

- [ ] **Step 3: Update `.claude/context/tasks.md`** — note share-target/profile reads are now tenant-scoped.

- [ ] **Step 4: Commit**

```bash
git add .claude/context/dohdash.md CLAUDE.md .claude/context/tasks.md
git commit -m "docs(tenancy): document multi-tenant architecture"
```

---

## Final gate (before any prod push — REQUIRES USER APPROVAL)

1. `npm run build` clean.
2. `verify-migration.mjs` and `verify-tenant-isolation.mjs` both all-pass against a **prod-clone**.
3. Confirmed fresh prod backup exists.
4. User explicitly approves `supabase db push` + the Vercel deploy.
5. Configure `*.dohdash.app` wildcard redirect in Google Cloud Console + Supabase Auth before the first non-`built` tenant goes live.

## Self-review notes

- **Spec coverage:** tenants table + config-as-a-row (P1) ✓; tenant_id everywhere + migration order (P1–2) ✓; RLS rewrite + DEFINER hardening (P3) ✓; resolution + pre-auth public config (P4) ✓; auth/provisioning + host-mismatch (P5) ✓; cross-tenant isolation suite + migration verify (P6) ✓; error handling for unresolvable host / RPC fail (P4 Step 7 + final gate) ✓; out-of-scope items left out ✓.
- **Naming consistency:** `current_tenant_id()`, `get_tenant_public_config(p_hostname)`, `resolveTenantSlug`, `getTenantPublicConfig`, `TenantResolution` used identically across phases.
- **Known adaptation:** SQL migration phases use apply-then-verify (assertion queries) rather than unit-TDD — DB schema changes don't fit the red-green unit cycle; TS phases (4–6) use real TDD.
