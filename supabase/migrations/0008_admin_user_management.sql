-- Admin user management: audit log, full user offboarding, last-sign-in
-- visibility. Three pieces:
--
--   admin_audit_log          append-only record of admin actions. RPC-backed
--                            actions write rows atomically inside SQL; the
--                            direct-table-write actions (grant/revoke app
--                            access, role toggle, reject request, cancel
--                            pending) log from the client after success.
--   admin_remove_user()      deletes the auth.users row, cascading to
--                            profiles -> app_access and access_requests.
--                            notes/folders owner_id is ON DELETE SET NULL so
--                            documents survive.
--   admin_list_user_activity() exposes auth.users.last_sign_in_at (natively
--                            maintained by GoTrue) to admins — no triggers or
--                            extra columns needed.

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target text not null,
  detail jsonb,
  created_at bigint not null
);

alter table public.admin_audit_log enable row level security;

create policy "audit: admins read"
  on public.admin_audit_log for select
  using (public.is_admin());

-- Client-side logging path. Append-only: no update/delete policies.
create policy "audit: admins insert own"
  on public.admin_audit_log for insert
  with check (public.is_admin() and actor_id = auth.uid());

-- Shared by the SECURITY DEFINER RPCs below so their audit writes bypass RLS.
create or replace function public.log_admin_action(p_action text, p_target text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.admin_audit_log (actor_id, action, target, detail, created_at)
  values (auth.uid(), p_action, p_target, p_detail, (extract(epoch from now()) * 1000)::bigint);
$$;

-- Full offboarding. Self-removal is blocked, which by itself guarantees at
-- least one admin always remains: the caller must be an admin and can never
-- be the target.
create or replace function public.admin_remove_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_remove_user: permission denied';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'admin_remove_user: cannot remove yourself';
  end if;

  perform public.log_admin_action(
    'remove_user',
    coalesce((select email from public.profiles where id = p_user_id), p_user_id::text),
    null
  );

  delete from auth.users where id = p_user_id;
end;
$$;

create or replace function public.admin_list_user_activity()
returns table (user_id uuid, last_sign_in_at bigint)
language sql
security definer
set search_path = public
as $$
  select u.id, (extract(epoch from u.last_sign_in_at) * 1000)::bigint
  from auth.users u
  join public.profiles p on p.id = u.id
  where public.is_admin();
$$;

-- Recreate the two existing admin RPCs (0003, 0006) with audit logging added.

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

  perform public.log_admin_action('provision_user', p_email, jsonb_build_object('role', p_role));
end;
$$;

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

  perform public.log_admin_action('accept_request', req.email, null);
end;
$$;
