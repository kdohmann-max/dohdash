---
name: new-tenant
description: Onboard a new DohDash tenant — emits the exact Supabase SQL (tenants row + first-admin provisioning) and the OAuth/redirect checklist from a few inputs. No codebase scanning.
tags: [tenancy, onboarding, supabase, sql]
---

# New Tenant Onboarding

Onboard a new customer onto the shared multi-tenant DohDash platform (one Vercel
deploy + one Supabase project serve all tenants). All required knowledge is
pre-baked here — do **NOT** grep the codebase or read migrations.

> **Prefer the in-app Operator panel.** A super admin (`profiles.super_admin`) can
> now create tenants, edit branding, and provision the first admin from
> `/dashboard/operator` (no SQL). Use this skill only as the fallback when the
> panel isn't usable — e.g. seeding the very first super admin, or recovery. The
> panel performs the same steps; the go-live URL/OAuth checklist below still
> applies either way.

## Goal

Produce a copy-paste-ready SQL block (for the Supabase SQL editor) plus a short
manual checklist. There is no admin UI for cross-tenant management yet, so this
is deliberately manual SQL the user runs themselves. **Do not run it for them** —
you have no service-role path to prod, and tenant creation is a deploy-class
action.

## Inputs to collect (ask only for what's missing)

- **slug** — short lowercase id, used for `<slug>.dohdash.app` and dev (`VITE_DEV_TENANT_SLUG`). e.g. `acme`
- **name** — display company name, e.g. `Acme Corp`
- **admin email** — the first admin's Google account
- **branding** (optional): dashboard name (default `<name> Dashboard`), accent color (default `#c86c2e`), secondary accent (default `#1e40af`), logo path (default `/company-logo.svg`), admin phone, an `about` blurb. Apply sensible defaults rather than blocking on these.
- **custom_domain** (optional) — only if they already have a `*.vercel.app` URL or real domain to map now; otherwise leave NULL and use dev/subdomain.

## Get the config shape from the live `built` tenant (do NOT transcribe it here)

The `config` jsonb is in the `CompanyInfo` shape, and that shape evolves (color
tokens, typography, dark variants get added over time). **Never hand-write the
config from memory or copy a template baked into this skill** — it goes stale and
onboards new tenants with a wrong/incomplete branding object. Instead, start from
the live `built` config so you inherit the current, complete shape:

- **Preferred:** have the operator paste the result of
  `select config from public.tenants where slug = 'built';` (run in the Supabase
  SQL editor). That's the authoritative current shape.
- **Offline fallback:** read the seed block in
  `supabase/migrations/0016_tenancy_schema.sql` (the `insert into public.tenants`
  for `'built'`) — it's the same object at creation time.

Then produce the new tenant's config by **adapting that object**: swap
`companyName`/`dashboardName`/`adminContact`/`logo`/`about`, override
`styleGuide.colors.accent` / `accentSecondary` (and their `dark*` variants) if the
customer gave colors, set `appNames` (usually `{}`), and leave every other key
exactly as the `built` config had it. Don't drop keys you don't recognize —
carry them through verbatim.

## The SQL to emit

Granting tenant = the operator's profile (kdohmann@gmail.com on tenant `built`).

```sql
-- ============ Onboard tenant: <NAME> (<SLUG>) ============
-- Step 1 — create the tenant row.
-- <CONFIG_JSON> = the built config, adapted per the section above (NOT a
-- template from this skill). Keep it a single jsonb literal.
insert into public.tenants (slug, name, custom_domain, config, created_at)
values (
  '<SLUG>', '<NAME>', null,  -- set custom_domain here only if mapping a URL now
  $config$
  <CONFIG_JSON>
  $config$::jsonb,
  (extract(epoch from now()) * 1000)::bigint
);

-- Step 2 — provision the first admin (cannot use admin_provision_user: it scopes
-- to the *caller's* tenant, so insert into pending_profiles directly). The
-- handle_new_user trigger promotes this to profiles on first Google sign-in.
with t as (select id from public.tenants where slug = '<SLUG>')
insert into public.pending_profiles (email, role, granted_by, tenant_id)
select '<ADMIN_EMAIL>', 'admin',
       (select id from public.profiles where email = 'kdohmann@gmail.com'),
       t.id
from t;
```

## Manual checklist to hand the user (these are NOT SQL)

After the SQL runs, the tenant still needs a reachable URL + working OAuth:

1. **Give them a URL** (pick one):
   - *Local dev:* set `VITE_DEV_TENANT_SLUG=<SLUG>` in `.env.local`, hit `localhost:5173`.
   - *Prod, no domain yet:* `update public.tenants set custom_domain = '<their-url>.vercel.app' where slug = '<SLUG>';`
   - *Prod, real/sub domain:* register it → add to Vercel → set `custom_domain` (or rely on `<slug>.dohdash.app` once that domain is live).
2. **Supabase Auth → URL Configuration → Redirect URLs:** add `https://<their-domain>/**`.
3. **Google Cloud Console → OAuth credentials:** add the origin + redirect URI for `<their-domain>`.

First sign-in by `<ADMIN_EMAIL>` promotes the pending row to an admin `profiles`
row; they can then provision their own users from the in-app admin panel.

## Rules

- Emit SQL as one copy-paste block; never invent table/column names not shown here.
- Do not run the SQL or attempt service-role writes to prod yourself.
- If the user gives no branding, use the defaults above and say what you defaulted.
- Validate the slug is lowercase alphanumeric/hyphen (it becomes a subdomain).
- Remind them the redirect-URL + OAuth steps are required or sign-in will fail.
