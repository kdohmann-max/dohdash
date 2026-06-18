-- profiles: one row per provisioned user. Rows are admin-created, never
-- auto-created on sign-in — the absence of a row is what drives the
-- "pending access" gate (see src/auth/useAuthState.ts).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at bigint not null
);

alter table public.profiles enable row level security;

-- SECURITY DEFINER bypasses RLS on the inner query, which avoids the
-- "infinite recursion detected in policy" error that a direct
-- `exists (select 1 from profiles where ...)` subquery would cause when
-- used inside a policy on profiles itself.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create policy "profiles: read own row"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: admins manage all"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());
