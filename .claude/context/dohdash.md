# DohDash Shell — Context

## Auth state machine

`src/auth/useAuthState.ts` — a single `supabase.auth.onAuthStateChange` subscription drives all auth state. Never call `getSession()` separately (race condition). `deriveAuthState(session, outcome)` is pure — unit-testable without React or Supabase.

```ts
type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "pending-access"; session: Session }
  | { status: "authenticated"; session: Session; profile: Profile }
  | { status: "error"; message: string }
```

- **`pending-access` vs `error` is intentional:** `getProfile` returns `null` only on Postgres `PGRST116` (no row) → `pending-access`. Any other failure throws → `error` with retry button. Never silently mislabeled.
- `profileState` is tagged with `userId` so a stale fetch from a sign-out/sign-back-in race can't corrupt the current user's state.

## Routing

`src/App.tsx` — `BrowserRouter`; `AuthGate` is a layout route guarding `/dashboard/*`. After the OAuth round-trip, `REDIRECT_STORAGE_KEY` (`dohdash:redirect` in `sessionStorage`) restores the original deep-link destination.

## Admin panel

`src/admin/` — `AdminDashboard.tsx` (4 tabs: Users / App Access / `AppAccessPanel.tsx` / Activity / `ActivityPanel.tsx` / Groups / `GroupsPanel.tsx`).

**Provisioning (email pre-authorization):**
1. Admin enters email → `provisionUserByEmail()` → `admin_provision_user` RPC
2. Not signed in yet → row lands in `pending_profiles`; `handle_new_user` trigger on `auth.users` INSERT promotes it to `profiles` on first sign-in
3. Already signed in → goes straight to `profiles`

**Self-service onboarding:** a user hitting the pending gate (`PendingAccessPage`) writes to `access_requests`; admin accepts (`admin_accept_access_request` RPC) or rejects.

**User removal:** `admin_remove_user` RPC deletes the `auth.users` row (cascades to profiles/app_access/access_requests) but keeps their docs (`owner_id` → null); rejects self-removal so ≥1 admin always remains.

**Activity:** `admin_list_user_activity` RPC → last-sign-in per user.

**Audit log** (`admin_audit_log`, `AuditAction` union): dual-write — direct-table actions (grant/revoke app access, role change, reject, cancel pending) log client-side via `logAdminAction`; RPC-backed actions (provision, accept, remove) log inside SQL.

`is_admin()` is a `SECURITY DEFINER` function — avoids RLS self-referential recursion from a plain `exists (select ... from profiles where role = 'admin')` policy on `profiles` itself. `can_view_all_time()` (`SECURITY DEFINER`, migration `0023`) is a similar helper: `is_admin() OR has_app_access('time-dashboard')` — gates all time-tracking dashboard access (read all entries, manage pay, rates). App id `time-dashboard` is the `app_access` grant that promotes a non-admin to dashboard-level visibility.

## CompanyInfo portability

`src/company/companyInfo.ts` — `loadCompanyInfo()` fetches `/CompanyInfo.md` at runtime; `applyCompanyTheme()` writes `styleGuide` as CSS vars on `document.documentElement` (token list: `styleguide.md`). `CompanyInfoContext` exposes `companyName`, `dashboardName`, `adminContact`, `logo`, `appNames`. `data-theme` on `<html>` toggles light/dark via `src/theme.ts` (localStorage + `prefers-color-scheme`). To port: see `CLAUDE.md`.

## Multi-tenancy

DohDash is a shared multi-tenant platform: one Vercel deployment + one Supabase project serve all customers. Doh Built Inc. (`slug='built'`) is tenant #1. Migrations `0016`–`0021`.

- **`tenants` table** (`0016`): `id, slug, custom_domain, name, config jsonb, created_at`. `config` holds the public `CompanyInfo` branding (frontmatter + `about` body) — `public/CompanyInfo.md` is now just the **seed template** for tenant #1, no longer fetched at runtime.
- **`tenant_id` on every tenant-owned table** (the 14 listed below; `scratch_cache` stays global). Lifecycle: nullable (`0016`) → backfilled to `built` + `NOT NULL` (`0017`) → `DEFAULT current_tenant_id()` (`0021`) so existing client inserts auto-stamp the tenant with no call-site changes.
- **`current_tenant_id()`** — `SECURITY DEFINER` helper returning the caller's `profiles.tenant_id` (mirrors `is_admin()`; avoids RLS recursion). Created **after** the `tenant_id` columns in 0016 (a `language sql` body is validated at creation time).
- **RLS (`0018`)**: every policy on every tenant-owned table ANDs `tenant_id = current_tenant_id()` onto its existing predicate; `resolve_note_permission`/`resolve_folder_permission` also carry an explicit tenant guard. The old "profiles: app members read directory" policy was folded into a tenant-scoped same-tenant read. `access_requests` INSERT is **not** tenant-predicated (requester has no profile yet). Proven isolated by `scripts/dev/verify-tenant-isolation.mjs`.
- **Hostname resolution**: `src/company/tenantResolver.ts` maps host → subdomain slug / custom domain / dev (`VITE_DEV_TENANT_SLUG`). `loadCompanyInfo()` calls anon RPC `get_tenant_public_config(hostname)` (`0019`) instead of fetching the file; `CompanyInfoContext` exposes `notFound` for an unrecognized host. `get_tenant_id_for_host(hostname)` (`0020`) resolves host → tenant id (the `tenants` table has no authenticated SELECT policy).
- **Provisioning (`0020`)** stamps `tenant_id`: `admin_provision_user`/`handle_new_user`/`admin_accept_access_request` use the admin's / pending row's / request row's tenant. `access_requests` is stamped client-side from the host. Reserved `profiles.super_admin` column exists for the operator (unused by app logic yet).
- **Auth guard**: `deriveAuthState(session, outcome, expectedTenantId)` → `signed-out` when `profile.tenantId` ≠ the host's tenant (fail-open if the host can't be resolved — RLS is the real wall).
- **Storage**: tenant reads in `src/storage/tenants.ts` (`getTenantPublicConfig`, `getTenantIdForHost`, `TENANT_NOT_FOUND`), re-exported via `db.ts`.
- **Local testing**: `supabase start` (needs Docker + `config.toml` from `supabase init`); `supabase status -o env > .env.test`; then `npm run verify:migration` / `npm run verify:isolation`. Never run the seeding isolation script against prod (guarded by `VERIFY_ALLOW_REMOTE`).
- **`dohdash.vercel.app` mapping** (`0022`): `custom_domain = 'dohdash.vercel.app'` set on the `built` tenant so the existing Vercel URL resolves branding from DB. Temporary — remove/replace when `dohdash.app` is registered.

## Tenant onboarding (current process — all manual SQL)

No admin UI exists yet for cross-tenant management. Until the super admin panel
is built, onboard new tenants via the Supabase SQL editor. **Use the
`/new-tenant` skill** — it's the single source for the onboarding procedure
(generates the `tenants` insert from the *live* `built` config so the branding
shape never drifts, plus the first-admin `pending_profiles` insert and the
URL/OAuth-redirect checklist). The key facts the skill encodes:

- The `tenants.config` jsonb follows the `CompanyInfo` shape; derive a new
  tenant's config from the live `built` row (`select config from tenants where
  slug='built'`) or the `0016` seed block — never a hand-written template.
- First admin can't go through `admin_provision_user` (it scopes to the caller's
  tenant); insert into `pending_profiles` directly with the new tenant's id,
  `granted_by` = the operator's profile. `handle_new_user` promotes it on first
  sign-in.
- Give them a URL (dev `VITE_DEV_TENANT_SLUG`, prod `custom_domain`, or a
  `*.dohdash.app` subdomain), then add `https://<their-domain>/**` to Supabase
  Auth redirect URLs and register the origin + redirect URI in Google OAuth.

## What still needs building (multi-tenancy roadmap)

- **Super admin panel** (`profiles.super_admin = true` gates it; column exists, unused): cross-tenant tenant list, create tenant (name/slug/branding config), provision first admin cross-tenant, set/update `custom_domain`. The cross-tenant provision RPC would check `super_admin` instead of `is_admin()` and accept an explicit `p_tenant_id` arg.
- **`dohdash.app` domain registration**: buy the domain → add `dohdash.app` + `*.dohdash.app` in Vercel → DNS records at registrar (A `@` → `76.76.21.21`, CNAME `*` → `cname.vercel-dns.com`) → update Supabase Auth redirect URLs to `https://*.dohdash.app/**` → add origins/redirects in Google OAuth → update `built` tenant `custom_domain` to `built.dohdash.app` (and remove `dohdash.vercel.app` mapping from 0022).
- **Wildcard subdomains** (`*.dohdash.app`): once domain is registered, each tenant gets `<slug>.dohdash.app` automatically — Vercel wildcard + `split_part` SQL already handles it, no code changes needed.
- **Tenant branding editor**: UI for a tenant's own admin to update their `config` JSON (colors, company name, logo) without needing SQL access.

## Storage constraint

**All Supabase DB calls go through `src/storage/` only.** The single client lives in `src/storage/client.ts`; every domain module imports it from there. Permitted exceptions: `supabase.auth` in `useAuthState.ts`, `supabase.functions.invoke` in Chicken Scratch, and `src/storage/realtime.ts` (Realtime broadcast for DohDocs presence/live-refresh — shares the same client from `client.ts`; components use its typed subscribe helpers, never supabase directly).

**Folder layout** (split by domain so the file stopped being a merge-conflict magnet):
- `client.ts` — the one `supabase` client.
- `db.ts` — **barrel only**: `export * from` each domain module. Consumers still import `from ".../storage/db"`, so the split needed zero consumer changes.
- `profiles.ts` — `Profile`/`Role` + `getProfile`/`listProfiles`/`updateProfileRole`.
- `appAccess.ts` — `app_access` reads/writes.
- `admin.ts` — provisioning, access requests, user removal/activity, audit log (imports `Role` from `profiles.ts`).
- `groups.ts` — groups + members.
- `notes.ts` — docs/folders CRUD + `uploadImage`.
- `shares.ts` — `note_shares`/`folder_shares` + `searchShareTargets`.
- `comments.ts` — `doc_comments` CRUD.
- `remote.ts` — Remote Claude projects/sessions + `subscribeToRemoteSession`.
- `time.ts` — `time_entries`/`time_jobs`/`time_rates` CRUD + `setEntriesPaid`/`setTimeRate`. See `time-tracking.md`.

Tables: `profiles`, `app_access`, `pending_profiles`, `access_requests`, `admin_audit_log`, `notes`, `folders`, `doc_comments`, `groups`, `group_members`, `note_shares`, `folder_shares`, `remote_projects`, `remote_sessions`, `time_entries`, `time_jobs`, `time_rates`.

`app_id` is a code-defined string key into `APP_REGISTRY` (`src/apps/registry.tsx`) — apps are not DB rows.

## Platform Groups

Admin-managed groups (`groups` + `group_members` tables) live at the DohDash shell level so any app can use them for sharing.

- **SELECT** on both tables: any authenticated user (needed for share-target search)
- **INSERT/UPDATE/DELETE**: `is_admin()` only; `group_members` has no UPDATE policy (add/remove only)
- `db.ts` exports: `listGroups`, `createGroup`, `updateGroup`, `deleteGroup`, `listGroupMembers`, `addGroupMember`, `removeGroupMember`, `listMyGroups`
- Admin UI: `src/admin/GroupsPanel.tsx` — left column list + right detail pane (editable name/description, delete with confirmation). **Member management is a checkbox roster:** every profile is listed with a checkbox (current members float to top), a filter box narrows by name/email, and toggling a checkbox calls `addGroupMember`/`removeGroupMember`. No type-to-search-then-pick — chosen deliberately for non-technical users (see CLAUDE.md "UX mandate").

## Dev auth bypass & browser testing

For local testing/troubleshooting, Claude can load DohDash already
`authenticated` (bypassing Google OAuth) using Playwright:

1. `.env.local` must have `SUPABASE_SERVICE_ROLE_KEY` (service_role secret,
   Project Settings -> API in Supabase). Only read by scripts in `scripts/`
   via `--env-file`; never imported by `src/`.
2. `npm run auth:mint` mints a session for the admin test user
   (`yeg.built.form@gmail.com`) via `generateLink`/`verifyOtp` and writes
   `playwright/.auth/admin.json` (Playwright storageState, gitignored).
   Uses the `email_otp` from `generateLink`, not `hashed_token` — this
   project's GoTrue rejects `hashed_token` as immediately expired.
3. With `npm run dev` running, write a one-off script under `scripts/dev/`
   that launches Chromium with `storageState: "playwright/.auth/admin.json"`
   to land on `/dashboard` pre-authenticated — see
   `scripts/dev/check-dashboard.mjs` for the pattern.
4. OAuth troubleshooting: a session-loaded context exercises post-redirect
   states (`pending-access`/`error`/profile provisioning, see
   `useAuthState.ts`); a fresh context with no `storageState` clicking
   "Sign in with Google" reveals pre-redirect config issues (redirect URI
   mismatch) without real Google credentials.

Re-run `npm run auth:mint` if the session expires or is rotated.
