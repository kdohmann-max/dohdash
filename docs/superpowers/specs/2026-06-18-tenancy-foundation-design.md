# Tenancy Foundation — Design

> **Status:** Approved 2026-06-18. First spec in the multi-tenant transition.
> **Author context:** DohDash is moving from "a portable single-tenant app
> (one Supabase project + one Vercel deploy + one `CompanyInfo.md` per customer)"
> to a **shared multi-tenant platform** so a solo operator can run 20+ customers
> with a control plane. This spec is the foundation the rest sits on.

## Decisions locked before this design

- **Tenancy model:** Approach A — shared multi-tenant. One Vercel deployment, one
  Supabase project, `tenant_id` + RLS for isolation, config-as-a-row. Hybrid
  (per-customer isolated instance) is kept only as a future escape hatch for a
  customer needing physical isolation; not built here.
- **Trial sequencing:** Build the foundation first; today's Doh Built Inc. install
  becomes **tenant #1**; the trial customer onboards later as **tenant #2** in the
  shared system (no double-migration of the trial customer).
- **Customer URLs:** Both — every tenant gets a subdomain (`slug.dohdash.app`)
  by default; a customer may map their own custom domain later for white-label.
- **"Custom apps" meaning:** per-customer app enable/disable (operator-controlled),
  per-app feature show/hide + styling, customer admin still controls per-user app
  access, and some customers get apps built only for them. *All of that is later
  specs;* this one only builds the tenancy substrate.

## Scope of THIS spec

Convert single-tenant DohDash into a shared multi-tenant platform and migrate the
existing Doh Built Inc. data in as tenant #1 — **without losing a single note,
permission, or style setting.** Sub-projects 1 (tenancy foundation) + 2
(existing-data migration) are designed together because you cannot add `tenant_id`
+ RLS without migrating the existing rows in the same unit of work.

---

## Section 1 — Architecture, Data Model & Resolution

### Architecture overview

One Vercel deployment, one Supabase project, serving every customer. At page load
the app resolves *which tenant* from the hostname, loads that tenant's public
config (branding/theme/enabled apps), and from then on **every** DB read/write is
scoped to that tenant by RLS. App code barely changes — the tenant filter lives in
the database, not in queries.

```
Browser hits built.dohdash.app  ──►  resolve hostname → tenant_id
        │                                     │
        │                          load tenant public config (pre-auth)
        │                          apply theme + enabled-apps list
        ▼
   Google OAuth (one wildcard redirect for *.dohdash.app)
        ▼
   profiles row carries tenant_id  ──►  RLS scopes notes/folders/app_access/etc
```

### Data model

**New `tenants` table** — one row per customer, holds what's today in
`CompanyInfo.md`:

```
tenants (
  id            uuid pk
  slug          text unique         -- subdomain: 'built' → built.dohdash.app
  custom_domain text unique null    -- optional white-label: 'app.acmebuilt.com'
  name          text                -- "Doh Built Inc."
  config        jsonb               -- styleGuide, appNames, adminContact, logo, about, enabled apps
  created_at    timestamptz
)
```

**`tenant_id uuid not null references tenants(id)` added to every tenant-owned
table:** `profiles`, `app_access`, `pending_profiles`, `access_requests`,
`admin_audit_log`, `notes`, `folders`, `doc_comments`, `groups`, `group_members`,
`note_shares`, `folder_shares`, `remote_projects`, `remote_sessions`.

Globally-shared tables stay un-scoped: `scratch_cache` is a content-hash cache,
tenant-agnostic by design (keyed on image hash + model).

**Config-as-a-row:** `CompanyInfo.md`'s entire payload moves into `tenants.config`
(jsonb). The `CompanyInfo` TypeScript type keeps the same shape — only the *source*
changes (DB row vs fetched markdown). This is what makes the future control plane
trivial: branding a customer = editing one row.

### Tenant resolution

- `built.dohdash.app` → `tenants` where `slug = 'built'`.
- `app.acmebuilt.com` → `tenants` where `custom_domain = 'app.acmebuilt.com'`.
- `localhost` / preview → `VITE_DEV_TENANT_SLUG` env fallback so local dev and the
  auth-bypass scripts still work.
- The tenant's **public config must be readable before login** (to theme the
  landing/sign-in page). A `SECURITY DEFINER` RPC `get_tenant_public_config(hostname)`
  returns only the safe branding subset (name, theme, logo, enabled apps) — never
  anything sensitive — callable by the anon role. This replaces the current
  unauthenticated `fetch("/CompanyInfo.md")`.

**Why this shape:** preserves the "re-brand without a rebuild" property (config is
data, not code); keeps all DB access inside `src/storage/` (a new `tenants.ts`
domain module + the RPC); and RLS-scoping means existing app code (`listDocs`,
`app_access`, etc.) needs almost no changes — the tenant wall is enforced beneath
them.

---

## Section 2 — Auth, RLS Rewrite & Existing-Data Migration

### Auth changes

Keep **one** shared Supabase Auth (one Google OAuth client). Changes bind users to
tenants:

- **`profiles.tenant_id`** — a user belongs to exactly one tenant (an employee
  works for one company). Same Google account at two customers = two profile rows
  in two tenants; rare, handled, not designed around.
- **OAuth redirect:** register the wildcard `*.dohdash.app` once in Google +
  Supabase. Custom domains are added per-customer only when a customer opts into
  white-label. `signInWithGoogle` already uses `window.location.origin`, so it
  works per-domain unchanged.
- **Tenant-scoped provisioning:** `admin_provision_user` and the `handle_new_user`
  trigger stamp the new profile with the admin's `tenant_id` (or, for first
  sign-in, the tenant resolved from the hostname, carried through
  `pending_profiles`). A customer admin can only provision into their own tenant —
  enforced server-side, never trusted from the client.
- **`is_admin()` becomes tenant-aware:** "admin" means admin *of your tenant*. A
  `super_admin` boolean on profiles (default false, set only on the operator's own
  row) is reserved now so cross-tenant operator access has a home in the
  control-plane spec — not used by app logic yet.

### RLS rewrite — the heart of the isolation

Today RLS scopes rows by `owner_id` / `is_admin()`. Multi-tenant adds a **tenant
predicate to every policy** so no query can cross tenants even with an app-code bug.

- A `current_tenant_id()` `SECURITY DEFINER` helper returns the calling user's
  `tenant_id` from their profile (analogous to today's `is_admin()`).
- Every policy on every tenant-owned table gains `AND tenant_id = current_tenant_id()`.
  Existing owner/share/admin logic stays; tenant scoping layers on top.
- `resolve_note_permission()` and other `SECURITY DEFINER` functions get the same
  tenant check internally — `SECURITY DEFINER` bypasses RLS, so they must enforce
  tenancy explicitly or they become a hole.

This is the blast-radius surface inherent to logical (RLS) isolation. The
mitigation is the cross-tenant isolation test suite (Section 3), required to pass
before any release goes wide.

### Existing-data migration (Doh Built → tenant #1) — riskiest step

Conservative and reversible, to honor the "don't lose their data" constraint:

1. **Backup first.** A documented `pg_dump` / Supabase snapshot is a required gate
   before the migration runs — not optional.
2. Create `tenants`; insert **tenant #1** = Doh Built (`slug = 'built'`), `config`
   transcribed from the current `CompanyInfo.md` values.
3. Add `tenant_id` columns **nullable** first.
4. **Backfill:** `UPDATE every table SET tenant_id = <doh-built-id>` — every
   existing row belongs to tenant #1.
5. **Then** flip columns to `NOT NULL` and add the RLS tenant predicates. Order
   matters: backfill before NOT NULL, before policies — otherwise you lock yourself
   out of your own data mid-migration.
6. **Verify gate:** a checklist script confirms row counts match pre-migration,
   Doh Built's notes/permissions/groups still resolve, and a second synthetic
   tenant genuinely *cannot* see them — before this is called done.

All migrations are **additive** (new columns/tables/policies); nothing existing is
dropped or destructively rewritten, so restore-from-backup is a clean rollback.

---

## Section 3 — Config Loading, Error Handling, Testing & Scope

### Config loading (replacing CompanyInfo.md)

- `companyInfo.ts` changes its *source*, not its output: instead of
  `fetch("/CompanyInfo.md")` + YAML parse, it calls `get_tenant_public_config(hostname)`
  and returns the same `CompanyInfo` shape. `applyCompanyTheme()` is **unchanged**.
- New `src/storage/tenants.ts` domain module owns all tenant reads/writes (one-client
  rule preserved).
- `public/CompanyInfo.md` stays in the repo as the **seed template** for tenant #1's
  config and as documentation of the config shape — no longer fetched at runtime.
- New-tenant flow (foundation-level, manual for now): insert a `tenants` row with
  config cloned from a default template. The UI for this is the control-plane spec.

### Error handling

- **Unresolvable hostname:** plain-language "This DohDash isn't set up yet — contact
  your administrator" page; never a crash or blank screen.
- **Config RPC fails:** distinguish "no such tenant" (the message above) from
  "network/server error" (retry button) — mirrors the existing `pending-access` vs
  `error` discipline in `useAuthState`.
- **User's `tenant_id` ≠ resolved hostname's tenant** (e.g. a Doh Built user lands
  on Acme's subdomain): treat as signed-out for that host — they're not a member
  there. Prevents accidental cross-tenant sessions.

### Testing

- **Cross-tenant isolation suite (critical):** for every tenant-owned table, assert
  tenant A's session cannot read/write/update/delete tenant B's rows. Directly
  exercises the RLS predicates and the `SECURITY DEFINER` function holes. This is
  the gate that makes logical isolation trustworthy.
- **Resolution / `deriveAuthState` unit tests:** pure hostname → slug/custom-domain/
  dev-fallback logic, tested without DB.
- **Migration verify script:** row-count parity + Doh Built data resolves +
  synthetic tenant is blind to it.
- Extend the existing dev auth-bypass (`npm run auth:mint`) to mint sessions for two
  distinct tenants.

### Explicitly OUT of scope (separate later specs, dependency order)

1. **Operator control plane** — console to manage tenants / toggle apps / edit
   config. (This foundation makes it CRUD-over-`tenants`.)
2. **Two-gate app model** — per-tenant enabled apps + per-app feature/style config +
   bespoke-app gating. Depends on Phases 1–2 of the existing platform-refactor plan
   (`docs/superpowers/plans/2026-06-16-platform-refactor-and-polish.md`:
   registry-owns-the-app + route guard).
3. **Safe-release process** — formalized additive-migration + tenant smoke-test
   checklist.
4. **Bespoke-app packaging & confidentiality** — how one-customer apps live in the
   shared repo (source visible in bundle vs isolated).

The trial customer becomes **tenant #2** once this foundation + control-plane
onboarding exist.
