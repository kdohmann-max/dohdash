---
name: new-migration
description: Scaffold the next-numbered Supabase migration. For any tenant-owned table it bakes in tenant_id + tenant-scoped RLS by default, enforcing the multi-tenancy mandate.
tags: [supabase, migration, sql, tenancy, rls]
---

# New Migration

Create the next migration in `supabase/migrations/`. The whole point of this
skill is to make the **multi-tenancy invariant impossible to forget**:

> Every new tenant-owned table MUST get `tenant_id uuid not null default
> current_tenant_id()` AND `tenant_id = current_tenant_id()` in **every** RLS
> policy (`using` for SELECT/UPDATE/DELETE, `with check` for INSERT).
> `scratch_cache` is the one documented global exception.

## Step 1 — find the next number

Files are `NNNN_short_name.sql`, zero-padded to 4 digits, sequential. Look at the
highest existing number in `supabase/migrations/` and add 1. Pick a concise
snake_case suffix describing the change. Do **not** renumber or edit prior
migrations — they're already applied to prod.

## Step 2 — choose the template

Ask (or infer) whether this migration adds a **tenant-owned table**, alters an
existing table, or is a **global** object (function/view/non-tenant table). If
it's a tenant-owned table, you MUST use the tenant template below — no exceptions
unless the user explicitly says it's a documented global like `scratch_cache`.

### Template A — new tenant-owned table (the default for app data)

```sql
-- NNNN_<name>.sql — <one-line purpose>
-- Tenant-owned: carries tenant_id + tenant-scoped RLS per the multi-tenancy mandate.

create table public.<table> (
  id uuid primary key default gen_random_uuid(),
  -- ... your columns ...
  owner_id uuid references auth.users(id),            -- if rows are user-owned
  tenant_id uuid not null default public.current_tenant_id()
             references public.tenants(id),
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.<table> enable row level security;

-- SELECT — every predicate is ANDed with the tenant guard.
create policy "<table>: read same-tenant"
  on public.<table> for select
  using (tenant_id = public.current_tenant_id()
         and auth.uid() = owner_id);          -- replace with your read rule

-- INSERT — guard goes in WITH CHECK; tenant_id auto-stamps via the column default.
create policy "<table>: insert own"
  on public.<table> for insert
  with check (tenant_id = public.current_tenant_id()
              and auth.uid() = owner_id);

-- UPDATE
create policy "<table>: update own"
  on public.<table> for update
  using (tenant_id = public.current_tenant_id() and auth.uid() = owner_id)
  with check (tenant_id = public.current_tenant_id() and auth.uid() = owner_id);

-- DELETE
create policy "<table>: delete own"
  on public.<table> for delete
  using (tenant_id = public.current_tenant_id() and auth.uid() = owner_id);
```

Policy-predicate building blocks already in this DB (use instead of reinventing):
- `public.is_admin()` — caller is an admin **of their own tenant** (already tenant-scoped).
- `public.has_app_access('<app_id>')` — caller has the coarse app gate (e.g. `'tasks'`).
- `public.current_tenant_id()` — caller's tenant; `SECURITY DEFINER`, no RLS recursion.
- For shared resources, model on `notes`/`note_shares` policies in `0018_tenancy_rls.sql`
  (owner-or-grantee SELECT, owner-only write), always ANDed with the tenant guard.

### Template B — global object (function, view, or documented non-tenant table)

No `tenant_id`. Only valid for things that are intentionally cross-tenant
(`scratch_cache`) or tenant-agnostic helpers. State in a header comment **why**
it's exempt. If it's a `SECURITY DEFINER` function that reads tenant-owned rows,
add an explicit tenant guard inside the body (see how `resolve_note_permission`
compares the row's tenant to the caller's tenant in `0018`).

## Step 3 — wire up the app layer (remind the user)

A migration alone isn't shippable. Flag these follow-ups:
- Add the table to the **Tables** list in `.claude/context/dohdash.md`.
- DB access goes **only** through a domain module in `src/storage/` (re-exported by
  `db.ts`) — never raw `supabase` calls in components.
- Apply with `supabase db push` (don't run it yourself unless asked — it mutates prod).
- Consider adding the table to `scripts/dev/verify-tenant-isolation.mjs` so the
  isolation suite proves it's sealed.

## Rules

- Default to Template A. Producing a tenant-owned table without `tenant_id` + a
  tenant guard in every policy is a cross-tenant data leak — treat it as a bug.
- Never edit/renumber existing migrations; always create the next number.
- Keep RLS enabled (`enable row level security`) on every new table.
- Don't run `supabase db push` without explicit approval (it's a prod mutation).
