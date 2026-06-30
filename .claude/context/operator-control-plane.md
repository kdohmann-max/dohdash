# Operator Control Plane (Tenancy Admin) — Context

The **operator control plane** is the in-app console a single platform operator
uses to run every tenant on the shared DohDash deployment: list tenants, create
one, edit its branding, set its slug/custom domain, and provision its first admin.
It replaces the old manual-SQL `/new-tenant` flow with CRUD-over-`tenants`.

This is the companion detail to `dohdash.md` → "Multi-tenancy" (which covers the
tenancy *foundation*: `tenants` table, `tenant_id` + RLS on app data, hostname
resolution). Read that first; this file is specifically the **operator/super-admin
layer** on top.

> **Two distinct admin roles — don't conflate them:**
> - **Tenant admin** (`profiles.role = 'admin'`) — manages *their own tenant's*
>   users/app-access at `/dashboard/admin`. Tenant-scoped (`is_admin()`).
> - **Platform operator** (`profiles.super_admin = true`) — manages *all tenants*
>   at `/dashboard/operator`. Cross-tenant (`is_super_admin()`). Today only the
>   operator's own account (`kdohmann@gmail.com`) has the flag.

## Entry point & access

- Route `/dashboard/operator` → `OperatorRoute` (in `src/App.tsx`) renders the
  panel only when `state.profile.superAdmin` is true, else `<Navigate to="/dashboard">`.
- Shell shows a gated **"Operator"** nav link (launcher mode) when `profile.superAdmin`;
  the breadcrumb labels the route "Operator".
- The operator works entirely from **their own host** (`dohdash.vercel.app` / built's
  host). They never visit another tenant's subdomain to manage it — the panel reaches
  other tenants' rows via super-admin RLS. So the `deriveAuthState` tenant-membership
  guard needs no exception for the operator.

## DB foundation — migration `0024_operator_control_plane.sql`

`tenants` is the cross-tenant **registry**, so it is gated by `is_super_admin()`,
**not** `current_tenant_id()` (a documented Template-B exception to the multi-tenancy
mandate — it is the tenancy table itself, not tenant-owned app data).

- **`is_super_admin()`** — `SECURITY DEFINER`, mirrors `is_admin()`; reads
  `profiles.super_admin` for `auth.uid()`. Seeds `super_admin = true` on
  `kdohmann@gmail.com` (the operator's live account).
- **RLS on `tenants`** — super-admin `SELECT` / `INSERT` / `UPDATE`. **No `DELETE`
  policy** (tenant deletion is intentionally out of scope — would cascade across the
  14 tenant-owned tables). The anon `get_tenant_public_config` / `get_tenant_id_for_host`
  RPCs are unaffected (they're `SECURITY DEFINER` and bypass RLS).
- **`super_admin_provision_first_admin(p_tenant_id, p_email)`** — `SECURITY DEFINER`.
  The **only** path that stamps a *foreign* `tenant_id` onto a `pending_profiles`
  row (a direct insert would be RLS-blocked and the column default would stamp the
  operator's own tenant). Checks `is_super_admin()`, validates the tenant exists,
  inserts an `admin` pending row for the target tenant. **No audit write** —
  `log_admin_action` would mis-stamp the operator's tenant; operator-level audit is
  a deliberate later concern.

## Storage — `src/storage/tenants.ts`

Re-exported by `db.ts`. Anon-safe reads (`getTenantPublicConfig`, `getTenantIdForHost`)
predate this; the operator additions are gated by the `tenants` RLS above:

| Export | What it does |
|--------|--------------|
| `Tenant` / `TenantInput` | full tenant row type (`id, slug, customDomain, name, config: CompanyInfo, createdAt`) |
| `listTenants()` | all tenants (super-admin only via RLS) |
| `createTenant(input)` | insert a tenant row |
| `updateTenant(id, patch)` | partial update of `slug`/`name`/`customDomain`/`config` |
| `provisionFirstAdmin(tenantId, email)` | calls the cross-tenant provision RPC |

`Profile.superAdmin` (mapped from `super_admin`) flows through `getProfile` →
`AuthState.authenticated.profile`.

## UI — `src/operator/OperatorDashboard.tsx` (+ `.css`)

Left tenant list + right detail pane (mirrors `GroupsPanel`). Flow-scroll app (root
owns `padding`). Sections:

- **List / select / "+ New".**
- **Create** (`CreateTenantForm`): slug (validated `^[a-z0-9]+(-[a-z0-9]+)*$`),
  name, optional custom domain, branding fields. **Clones the live `built` config**
  (`cloneSource`) and overlays the structured fields, so a new tenant inherits the
  *current* full `CompanyInfo` shape — never a hand-written template (same rule the
  `/new-tenant` skill encodes).
- **Edit** (`TenantDetail`): Identity (name/slug/custom_domain + resolved URL),
  Branding, **Enabled apps**, and a **hybrid config editor**:
  - Structured fields for the keys that actually vary per tenant — company/dashboard
    name, admin contact, logo, and `accent` + `accentSecondary` color pickers.
  - **Enabled apps** (`EnabledAppsEditor`): checkbox list of all `APP_REGISTRY` entries.
    Defaults to all checked for tenants without an existing `enabledApps` key (backward
    compat). Stub apps shown so the operator can pre-enable them before they ship.
    On save, `config.enabledApps` is written as a structured field (wins over raw JSON).
    Enforcement: `isTenantAppEnabled()` in `registry.tsx` gates the launcher filter,
    `RequireAppAccess` in `App.tsx` (synchronous, admins do NOT bypass), and the
    Admin App Access panel (hides disabled apps + shows a note).
  - A validated **raw-JSON `config` box** for everything else (parsed before save;
    save blocked on invalid JSON). Structured fields win their keys on save.
  - **No spacing/radius/typography fields** — design-system identity, not branding
    (the full-styleGuide-form idea was rejected by Senate review as drift-prone).
- **First admin** (`provisionFirstAdmin`) — with a ⚠ warning to use a never-before-used
  Google account (see Gotchas).
- **Go-live checklist** (`OnboardingChecklist`) — the steps the UI can't perform,
  branching on custom-domain vs `*.dohdash.app` subdomain (DNS records, Supabase
  redirect URL, Google OAuth origin; Supabase callback derived from
  `VITE_SUPABASE_URL`).

### Theme fix shipped alongside
`applyCompanyTheme()` now writes `--accent-secondary` / `--accent-tertiary` (+ dark
variants); they were hardcoded in `index.css` and ignored per-tenant, so an
operator's accent edit had no visual effect. `ColorPalette` type completed to match
the real config shape.

### Wrong-workspace auth state
`deriveAuthState` returns a distinct `wrong-tenant` state (was folded into
`signed-out`) when a signed-in account's `tenantId` ≠ the host's tenant. `AuthGate`
renders a plain-language "Wrong workspace" card with sign-out, instead of silently
looping the user through the login button.

## Onboarding a tenant — the full operational flow

In-app (operator does):
1. **+ New** → slug + name + branding → Create. (Clones `built` config.)
2. **Invite admin** → a **brand-new** Google email (see Gotchas).

Manual, outside DohDash (still required — the panel surfaces these as a checklist):
3. **Make the URL reachable** — custom domain → add in Vercel + DNS record
   (apex `A @ → 76.76.21.21`, subdomain `CNAME → cname.vercel-dns.com`); or rely on
   `<slug>.dohdash.app` once that domain is live. (Today `*.dohdash.vercel.app`
   resolves to the project, which is how tenant #2 works pre-domain-registration.)
4. **Supabase** → Auth → URL Configuration → Redirect URLs → add
   `https://<domain>/**` (or `https://*.dohdash.app/**` once for all subdomains).
   **Required** — without it, Sign in does nothing.
5. **Google Cloud Console** → Credentials → OAuth client → Authorized JavaScript
   origins → add `https://<domain>`. The redirect URI (Supabase callback) is shared
   and already registered.
6. First sign-in by the invited admin promotes the pending row → they manage their
   own users in-app.

## Gotchas (learned onboarding tenant #2)

- **Per-domain OAuth is manual + required** (steps 4–5 above). The single most
  common "Sign in does nothing" cause is a missing Supabase redirect-URL entry for
  the new domain — the OAuth round-trip bounces back to login.
- **One Google account = one tenant.** `handle_new_user` only promotes a
  `pending_profiles` invite on an account's *first-ever* sign-in. Inviting an email
  that already has a DohDash profile in another tenant silently fails — that account
  hits the `wrong-tenant` state. A new tenant's first admin must be a never-used
  Google address. (A person legitimately working for two tenants is the unhandled
  edge — see Next steps.)
- **`tenants` has no authenticated SELECT for non-operators** — only `is_super_admin()`
  sees rows; everyone else relies on the two anon RPCs for branding/host resolution.

## Current live tenants

- **`built`** (Doh Built Inc., tenant #1) — `https://dohdash.vercel.app`
  (`custom_domain = 'dohdash.vercel.app'`, migration 0022).
- **`test`** (Test Corp, tenant #2) — `https://test.dohdash.vercel.app` (resolves by
  slug; no custom_domain). Onboarded entirely via the panel + validated end-to-end.

## Supabase redirect URL automation (shipped)

The **`register-tenant-domain` Edge Function** (`supabase/functions/register-tenant-domain/index.ts`)
calls the Supabase Management API to add `{url}/**` to the project's allowed redirect URLs.
The operator panel's go-live checklist now has a **"Register in Supabase"** button for step 2 —
one click, shows ✓ / "Already registered" / error.

- Requires one-time secret: `SUPABASE_ACCESS_TOKEN` — a Supabase Personal Access Token from
  `supabase.com/dashboard/account/tokens`. Set it with:
  `supabase secrets set SUPABASE_ACCESS_TOKEN=<pat>`
- Deploy the function: `supabase functions deploy register-tenant-domain`
- The project ref is derived at runtime from `SUPABASE_URL`; no extra config needed.
- Idempotent: re-clicking "Register" on an already-registered domain returns "Already registered".

**Google authorized origin (step 3) remains manual** — Google has no public API for updating
authorized JavaScript origins on OAuth 2.0 Web Application clients. The checklist now shows
one-click **Copy** buttons for both the origin URL and the Supabase callback URL to minimize friction.

## Two-gate app model (shipped)

Per-tenant enabled-apps gate on top of per-user `app_access` — the feature that makes "some
customers get only some apps" real. Both gates must pass for a user to see an app.

- **Gate 1 (per-user):** `app_access` table — admin grants per user.
- **Gate 2 (per-tenant):** `enabledApps` in `tenant.config` — operator toggles which apps are
  available for the entire tenant.

Implementation: `isTenantAppEnabled()` in `registry.tsx` checks both; `Launcher` filters by both;
`App.tsx` route guard enforces it; `EnabledAppsEditor` (in `OperatorDashboard.tsx` Edit pane) is
the operator UI. Backward compat: tenants without an explicit `enabledApps` key default to all
apps enabled. Admin's app-access panel (`AppAccessPanel`) hides disabled apps and shows a note.

## Next steps (prioritized)

**High value:**
1. **`dohdash.app` domain registration** — buy domain → Vercel `dohdash.app` +
   `*.dohdash.app` → DNS (A `@ → 76.76.21.21`, CNAME `* → cname.vercel-dns.com`) →
   Supabase redirect `https://*.dohdash.app/**` → Google origins → set `built`
   `custom_domain` to `built.dohdash.app` (remove the `dohdash.vercel.app` mapping).
   Then every tenant gets a clean `<slug>.dohdash.app` automatically.

**Medium:**
2. **Tenant branding editor (self-service)** — distinct from operator editing: a UI
   for a tenant's *own* admin to edit their `config` (colors/logo/name) without SQL
   or operator involvement.
3. **Multi-tenant account support** — let one Google account legitimately belong to
   more than one tenant (workspace-switcher), removing the "first sign-in only"
   limitation. Today it's "rare, not designed around."

**Lower / hardening:**
4. **Operator audit log** — operator actions are currently unlogged (the provision
   RPC skips `log_admin_action` to avoid mis-stamping). A dedicated operator-audit
   table would record create/edit/provision across tenants.
5. **Super-admin management UI** — granting `super_admin` to another account is
   SQL-only today.
6. **Tenant deletion** — intentionally absent (cascades across 14 tables); add only
   behind a hard confirmation + required backup gate.
7. **Run the isolation suite for 0024** — `scripts/dev/verify-tenant-isolation.mjs`
   has assertions (non-super-admin can't read `tenants`/call the RPC; provisioning
   stamps the target tenant) but needs a local Supabase to run; it was not a gate for
   the straight-to-prod push.
