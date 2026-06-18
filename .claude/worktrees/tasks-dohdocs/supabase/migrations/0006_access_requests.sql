-- access_requests: self-service onboarding. When an unrecognized user signs
-- in with Google and lands on the pending-access gate, a row is created here
-- so admins can see and act on the attempt. Additive to pending_profiles
-- (migration 0003) — that admin-initiated flow is unchanged.
--
--   Accept -> admin_accept_access_request() creates a profiles row with role
--             'member' and deletes this row.
--   Reject -> admin deletes this row directly (covered by the "admins manage
--             all" policy below); the user can sign in again later and a
--             fresh row will be created.

create table public.access_requests (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  requested_at bigint not null
);

alter table public.access_requests enable row level security;

-- Lets a freshly-signed-in, not-yet-provisioned user create their own
-- request row. There's no select/update policy for non-admins — the user
-- never needs to read or modify it after creating it.
create policy "access_requests: insert own"
  on public.access_requests for insert
  with check (auth.uid() = id);

-- Covers admin select (listing requests), delete (Reject), and the row read
-- inside admin_accept_access_request below.
create policy "access_requests: admins manage all"
  on public.access_requests for all
  using (public.is_admin())
  with check (public.is_admin());

-- Admin-facing entry point for Accept. Always grants role 'member' (admins
-- can promote via the existing "Make admin" toggle afterward). Mirrors
-- admin_provision_user's on-conflict handling for safety/idempotency.
create or replace function public.admin_accept_access_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.access_requests;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not public.is_admin() then
    raise exception 'admin_accept_access_request: permission denied';
  end if;

  select * into req from public.access_requests where id = p_user_id;
  if not found then
    raise exception 'admin_accept_access_request: no request for user %', p_user_id;
  end if;

  insert into public.profiles (id, email, display_name, avatar_url, role, created_at)
  values (req.id, req.email, req.display_name, req.avatar_url, 'member', now_ms)
  on conflict (id) do update set role = excluded.role;

  delete from public.access_requests where id = p_user_id;
end;
$$;
