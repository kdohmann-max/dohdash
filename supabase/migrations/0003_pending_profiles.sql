-- pending_profiles: email-keyed pre-authorizations created by admins for
-- people who haven't signed in yet. profiles.id is a FK to auth.users(id),
-- so we can't insert a profiles row until that UUID exists — this table lets
-- an admin grant access by email alone, in either order:
--
--   admin grants first  -> row sits here -> the trigger below converts it
--                          into a real profiles row the moment that email
--                          first signs in via Google
--   user signs in first -> admin_provision_user() finds their existing
--                          auth.users row and creates the profiles row
--                          immediately, skipping this table entirely

create table public.pending_profiles (
  email text primary key,
  role text not null default 'member' check (role in ('admin', 'member')),
  granted_by uuid references public.profiles (id),
  created_at bigint not null
);

alter table public.pending_profiles enable row level security;

create policy "pending_profiles: admins manage all"
  on public.pending_profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Fires after every new auth.users row. If the new account's email matches
-- a pending pre-authorization, immediately creates the matching profiles row
-- (carrying over the granted role) and clears the pending row. No-op
-- otherwise — most sign-ins from unprovisioned emails hit the pending-access
-- gate, exactly as intended.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending public.pending_profiles;
begin
  select * into pending from public.pending_profiles where email = new.email;

  if found then
    insert into public.profiles (id, email, display_name, avatar_url, role, created_at)
    values (
      new.id,
      new.email,
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'avatar_url',
      pending.role,
      (extract(epoch from now()) * 1000)::bigint
    );
    delete from public.pending_profiles where email = new.email;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Single admin-facing entry point for granting first-time access by email.
-- Looks for an existing auth.users row with this email:
--   found     -> create/update the profiles row right now (handles "user
--                already tried signing in, then got granted" ordering)
--   not found -> queue a pending_profiles row for the trigger above to
--                pick up on their first sign-in
-- security definer is required to read auth.users; the is_admin() check
-- inside replaces what RLS would normally enforce.
create or replace function public.admin_provision_user(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_user record;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not public.is_admin() then
    raise exception 'admin_provision_user: permission denied';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'admin_provision_user: invalid role %', p_role;
  end if;

  select id, raw_user_meta_data into existing_user
  from auth.users
  where email = p_email
  limit 1;

  if found then
    insert into public.profiles (id, email, display_name, avatar_url, role, created_at)
    values (
      existing_user.id,
      p_email,
      existing_user.raw_user_meta_data ->> 'full_name',
      existing_user.raw_user_meta_data ->> 'avatar_url',
      p_role,
      now_ms
    )
    on conflict (id) do update set role = excluded.role;
  else
    insert into public.pending_profiles (email, role, granted_by, created_at)
    values (p_email, p_role, auth.uid(), now_ms)
    on conflict (email) do update set role = excluded.role, granted_by = excluded.granted_by;
  end if;
end;
$$;
