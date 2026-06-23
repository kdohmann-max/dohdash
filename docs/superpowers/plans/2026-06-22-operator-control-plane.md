# Implementation Plan — Operator Control Plane (Super Admin Panel)

> **Status:** Phases 1–4 implemented 2026-06-22 (migration `0024` written, **not yet
> pushed** — awaiting operator review + prod `db push`). Written 2026-06-22.
> **Source spec:** `docs/superpowers/specs/2026-06-18-tenancy-foundation-design.md`
> → "OUT of scope" item #1 (Operator control plane). This is the first of the four
> deferred follow-on specs and the **dependency root** for the rest.
> **Goal in one line:** replace the manual-SQL `/new-tenant` onboarding with an
> in-app console where the platform operator can list every tenant, create a
> tenant, edit its branding config + slug + custom domain, and provision its first
> admin — all from `built`'s own host, gated by `profiles.super_admin`.

## What this turns into

Today onboarding a customer = the `/new-tenant` skill emitting copy-paste SQL the
operator runs in the Supabase SQL editor. This plan makes that
**CRUD-over-`tenants`**: the foundation already modeled config-as-a-row, so the
control plane is a UI on top of one table plus one cross-tenant provisioning RPC.

## Explicitly OUT of scope (kept for later specs)

- **Per-tenant app enable/disable ("toggle apps").** That is deferred item #2
  (two-gate app model) and needs a *read* path that gates the launcher/registry.
  This plan builds the seam (config is a jsonb row the operator can edit) but does
  **not** add an enabled-apps gate. Noted at the integration point in Phase 3.
- **Tenant self-service branding editor** (a *tenant admin* editing their own
  config) — separate roadmap item. This plan is **operator-only** editing.
- **Cross-tenant impersonation** (operator "logging in as" a tenant to see their
  app view). Operator manages tenants from `built`'s host via super-admin
  reads/writes; it never assumes another tenant's session. The
  `deriveAuthState` tenant-membership guard therefore stays unchanged.
- **Tenant deletion.** Destructive + cascades across 14 tenant-owned tables. No
  delete in this MVP; revisit with a hard confirmation + backup gate later.

## Hard constraints (apply to every phase)

- **NEVER `git commit`, `git push`, `supabase db push`, or deploy without explicit
  user approval.** A push to `master` triggers a live Vercel **prod** deploy; a
  `db push` mutates **prod** Supabase. Both are deploy-class.
- All Supabase DB access stays in `src/storage/` only (one-client rule). New
  operator reads/writes go in `src/storage/tenants.ts` (already exists, re-exported
  by `db.ts`).
- Follow `.claude/context/styleguide.md` (no hardcoded colors/px, shared icons,
  per-component scoped CSS).
- `npm run build` (runs `tsc -b` then Vite) must pass before a phase is "done".
- Migrations are **additive** and never renumber/edit an applied one — next number
  is `0024`. Use the `/new-migration` conventions.
- **Audience note:** unlike the rest of DohDash, the operator panel's user is the
  *technical solo operator*, not a field user. A raw-JSON config escape hatch is
  acceptable here (the UX mandate targets non-technical end users). Still provide
  structured fields for the common branding keys to prevent fat-finger errors.

---

## PHASE 1 — DB foundation: super-admin gate + tenant CRUD + cross-tenant provision

**Problem.** `profiles.super_admin` exists but nothing reads it; `tenants` has no
authenticated read policy; and there is no RPC that can provision a first admin
into a *different* tenant (every existing provisioning path scopes to the caller's
tenant).

**Goal.** A super admin can read/insert/update `tenants` rows and provision a first
admin into any tenant — enforced in the database, not just the UI.

**Files**
- `supabase/migrations/0024_operator_control_plane.sql` — new migration.
- `src/storage/tenants.ts` — add `Tenant` type + row mapper + operator reads/writes.
- `src/storage/profiles.ts` — add `superAdmin` to `Profile` + the row mapper.

**Migration `0024` contents** (additive; `tenants` is intentionally a
cross-tenant/global object — Template B in `/new-migration` — so it is **super-admin
gated, not `current_tenant_id()` gated**; state that in a header comment):

1. **`is_super_admin()`** — `SECURITY DEFINER`, mirrors `is_admin()`:
   `select coalesce(super_admin, false) from public.profiles where id = auth.uid();`
2. **RLS policies on `public.tenants`** for the super admin (the table already has
   RLS enabled with no authenticated policy; the anon `SECURITY DEFINER` RPCs are
   unaffected because they bypass RLS):
   - `SELECT using (public.is_super_admin())`
   - `INSERT with check (public.is_super_admin())`
   - `UPDATE using (public.is_super_admin()) with check (public.is_super_admin())`
   - (no DELETE policy — deletion is out of scope)
3. **`super_admin_provision_first_admin(p_tenant_id uuid, p_email text)`** —
   `SECURITY DEFINER`. Checks `is_super_admin()` (raise on deny); validates the
   target tenant exists; inserts into `pending_profiles (email, role='admin',
   granted_by = auth.uid(), tenant_id = p_tenant_id)` with
   `on conflict (email) do update set role='admin', tenant_id=excluded.tenant_id,
   granted_by=excluded.granted_by`. This is the only way to stamp a *foreign*
   tenant_id (the column default would stamp the operator's tenant). `grant execute
   … to authenticated`.
   - **Audit-log decision:** `log_admin_action` stamps `current_tenant_id()` (the
     operator's tenant), so a naive log lands in the wrong tenant's audit. For MVP,
     **skip the audit write inside this RPC** (operator actions aren't part of a
     tenant's own audit trail) and note it; a dedicated operator-audit table is a
     later concern.
4. **Seed the operator flag:** `update public.profiles set super_admin = true where
   email = 'kdohmann@gmail.com';` (same hardcoded-operator pattern the seed
   migrations already use). Idempotent.

**Storage (`tenants.ts`)** — add, keeping the existing anon helpers:
```ts
export interface Tenant {
  id: string; slug: string; customDomain: string | null;
  name: string; config: CompanyInfo; createdAt: number;
}
listTenants(): Promise<Tenant[]>                       // .from("tenants").select("*")
createTenant(input: { slug; name; customDomain; config }): Promise<Tenant>
updateTenant(id, patch: Partial<{slug;name;customDomain;config}>): Promise<void>
provisionFirstAdmin(tenantId: string, email: string): Promise<void>  // RPC above
```
Row mapper `tenant_id`-style snake↔camel; `config` passes through as `CompanyInfo`.

**`Profile.superAdmin`** — add `superAdmin: boolean` to the type and map
`super_admin` in `profileRowToProfile` (`getProfile` already `select("*")`s it).
Flows into `AuthState.authenticated.profile` with no other change.

**Acceptance**
- `npm run build` clean.
- (Manual, after an approved `db push` to a local/dev DB) a super-admin session can
  `listTenants()` and a non-super-admin cannot (RLS denies → empty/owner-only).
- `super_admin_provision_first_admin` rejects a non-super-admin caller and, for a
  super admin, lands a `pending_profiles` row stamped with the **target** tenant.

---

## PHASE 2 — Operator route, guard, and tenant list/detail (read-only first)

**Problem.** No entry point or screen exists for the operator.

**Goal.** A super admin sees an "Operator" nav link → `/dashboard/operator` →
a tenant list + read-only detail pane. Non-super-admins can't reach it.

**Files**
- `src/App.tsx` — add `OperatorRoute` guard + `<Route path="operator">`.
- `src/components/Shell.tsx` — add the gated "Operator" `NavLink` (launcher mode).
- `src/operator/OperatorDashboard.tsx` + `OperatorDashboard.css` — new, mirroring
  the `GroupsPanel` left-list / right-detail layout and scoped-CSS pattern.

**Steps**
1. `OperatorRoute`: mirror `AdminRoute` — `if (state.status !== "authenticated")
   return null; if (!state.profile.superAdmin) return <Navigate to="/dashboard"
   replace/>; return <OperatorDashboard/>;`
2. Shell launcher nav: after the `role === "admin"` Admin link, add
   `{profile.superAdmin ? <NavLink to="/dashboard/operator">Operator</NavLink> :
   null}`. (Breadcrumb mode already labels `/dashboard/admin` as "Admin"; add an
   `operatorMatch` → "Operator" label.)
3. `OperatorDashboard`: `listTenants()` on mount → left column list (name + slug +
   a "custom domain / subdomain" subtitle). Selecting a tenant shows a read-only
   detail pane: name, slug, custom_domain, first-admin-provision status hint, and
   the resolved URL (`<slug>.dohdash.app` or the custom domain). Flow-scroll app
   per the Shell contract (root gets `padding: var(--spacing-xl)`).
4. Empty/loading/error states in plain language.

**Acceptance**
- Super admin sees "Operator" in nav and the tenant list (at least `built`).
- A normal admin and a normal member do **not** see the link and get redirected if
  they type `/dashboard/operator`.
- `npm run build` clean; no app-shell flash.

**Risk note.** Auth-adjacent. Verify both super-admin and non-super-admin paths
with the dev auth bypass (`.claude/context/dohdash.md` → "Dev auth bypass").

---

## PHASE 3 — Create / edit tenant + provision first admin (the write path)

**Problem.** Read-only isn't onboarding. This phase replaces the `/new-tenant` SQL.

**Goal.** From the panel, the operator can create a tenant (cloning `built`'s config
shape + overriding the common branding fields), edit an existing tenant's
name/slug/custom_domain/config, and provision its first admin — then see the exact
URL + OAuth checklist they still must do manually.

**Files**
- `src/operator/OperatorDashboard.tsx` (+ `.css`) — create flow + editable detail.

**Steps**
1. **Create tenant.** "+ New tenant" form: slug (validated lowercase
   alphanumeric/hyphen — it becomes a subdomain), display name, dashboard name,
   admin contact email/phone, logo path, primary accent + secondary accent colors,
   optional custom_domain. On submit: **clone the live `built` config** (fetch it
   via `listTenants()` — already in memory) and apply the overrides over it, so the
   new tenant inherits the *current* full `CompanyInfo` shape (never a hand-written
   template — same rule the `/new-tenant` skill encodes). Call `createTenant`.
2. **Edit tenant.** Detail pane fields become editable (inline, GroupsPanel-style):
   name, slug, custom_domain, and the **hybrid config editor** (per the revised
   locked decision) → patch `config` + top-level columns via `updateTenant`:
   - Structured **Identity** fields (company/dashboard name, admin contact, logo,
     appNames) + the two **accent** color pickers (`accent`, `accentSecondary`).
   - A **raw-JSON `config`** textarea for everything else, validated with
     `JSON.parse` before save (block save on invalid). On open it shows the full
     current config; the structured fields write back into that object on save.
   - No spacing/radius/typography fields.
3. **Provision first admin.** A field on the detail pane: enter the first admin's
   Google email → `provisionFirstAdmin(tenantId, email)`. Show success + the
   reminder that the pending row promotes on first Google sign-in.
4. **Surface the manual checklist in-UI** (the part SQL can't do): after create,
   render the URL + Supabase redirect-URL + Google OAuth steps from the
   `/new-tenant` skill as a plain-language checklist so the operator isn't sent
   back to the skill doc.
5. **Validation & forgiveness:** unique-slug conflict → friendly message (don't
   leak the Postgres error); confirm before changing an existing slug/custom_domain
   (it changes the tenant's live URL).

> **Phase-3 seam for later item #2 (per-tenant apps):** the structured config editor
> is where an "enabled apps" checklist will live once the two-gate app model adds a
> read path. Leave a `// TODO(two-gate): enabled-apps editor mounts here` marker; do
> not build the gate now.

**Acceptance**
- Operator creates a second tenant end-to-end (row + first-admin pending) without
  touching SQL; the new config has the full `built` shape with overrides applied.
- Editing `built`'s accent color + saving re-themes `built` on next load.
- Invalid slug / invalid JSON / duplicate slug are blocked with clear messages.
- `npm run build` clean.

---

## PHASE 4 — Tests + docs

**Files**
- `scripts/dev/verify-tenant-isolation.mjs` — extend.
- `.claude/context/dohdash.md` — move the control plane from "What still needs
  building" into a built "Operator control plane" section; note `super_admin` is
  now live.
- `.claude/skills/new-tenant.md` — add a header note: prefer the in-app Operator
  panel; this SQL is the fallback when the panel is unavailable.

**Steps**
1. Isolation suite additions: assert (a) a non-super-admin session cannot
   `select * from tenants` (RLS) nor call `super_admin_provision_first_admin`
   (raises), and (b) a super admin can, and the provisioned `pending_profiles` row
   carries the **target** tenant_id, not the caller's.
2. Update docs as above.

**Acceptance**
- `npm run verify:isolation` passes including the new assertions (against a local
  Supabase per the dohdash.md "Local testing" steps — never prod).
- Docs reflect the shipped panel.

---

## Suggested order & shippability

Phase 1 (DB + storage + types) → Phase 2 (route/guard/read-only list) → Phase 3
(write path) → Phase 4 (tests/docs). Phases 1–2 are a safe, low-risk first
increment (no destructive writes, additive migration, read-only UI). Phase 3 is the
behavior-changing one and benefits from a human eye on the create/provision flow.
Each phase ends on a green `npm run build`; the migration and any `db push` wait for
explicit approval.

## Decisions locked (2026-06-22)

1. **Migration apply target:** I *write* `0024` and never `supabase db push` it.
   The operator reviews it, then pushes **straight to prod**. No local pre-prod
   isolation run; the isolation-suite additions (Phase 4) are written for when a
   local Supabase is available but are not a release gate for this push.
2. **Config editing depth:** **Hybrid** (revised 2026-06-22 after Senate review —
   the original "full structured styleGuide editor" was rejected as drift-prone: it
   re-implements the `/new-tenant` skill's clone-`built`-and-override pattern as
   hand-maintained form state that rots every time a token is added). Final shape:
   - Structured **Identity** fields: company name, dashboard name, admin contact
     (email/phone), logo path, appNames.
   - Structured **accent color** pickers: primary `accent` + `accentSecondary`
     (`<input type="color">` + hex). These are the tokens that actually vary per
     tenant.
   - A **raw-JSON `config` box** pre-filled from the cloned `built` config for
     everything else, validated with `JSON.parse` before save.
   - **Drop spacing / radius / typography editing entirely** — design-system
     identity, not per-tenant branding; no use case. (Still carried through verbatim
     in the cloned config; just not surfaced as editable fields.)
   The operator is technical, so the raw-JSON box is an acceptable (and drift-proof)
   escape hatch — it inherits the current full `CompanyInfo` shape automatically.
3. **Operator audit:** Skip audit logging of operator actions for MVP (avoids the
   wrong-tenant-stamp problem); revisit with a dedicated operator-audit table later.
