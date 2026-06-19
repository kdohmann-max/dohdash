-- Tenant-bind provisioning: every path that creates a profiles row stamps the
-- correct tenant_id, and add a host->tenant-id resolver the client needs for the
-- auth guard and for stamping access_requests (tenant_id is NOT NULL as of 0017).

-- Reserved for the platform operator (cross-tenant). Not used by app logic yet.
alter table public.profiles add column super_admin boolean not null default false;

-- Lightweight anon/authenticated resolver: hostname -> tenant id. The id is not
-- sensitive; this exists because the tenants table has no authenticated SELECT
-- policy. Used by (1) the client auth guard to compare the signed-in user's
-- tenant against the host's tenant, and (2) access_requests insert to stamp the
-- host tenant before the user has a profile.
create or replace function public.get_tenant_id_for_host(p_hostname text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select t.id
  from public.tenants t
  where t.custom_domain = p_hostname
     or t.slug = split_part(p_hostname, '.', 1)
  limit 1;
$$;

grant execute on function public.get_tenant_id_for_host(text) to anon, authenticated;

-- Recreate admin_provision_user (from 0008) stamping the calling admin's tenant.
create or replace function public.admin_provision_user(p_email text, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_user record;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
  caller_tenant uuid := public.current_tenant_id();
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
    insert into public.profiles (id, email, display_name, avatar_url, role, created_at, tenant_id)
    values (
      existing_user.id,
      p_email,
      existing_user.raw_user_meta_data ->> 'full_name',
      existing_user.raw_user_meta_data ->> 'avatar_url',
      p_role,
      now_ms,
      caller_tenant
    )
    on conflict (id) do update set role = excluded.role; -- never reassign tenant
  else
    insert into public.pending_profiles (email, role, granted_by, created_at, tenant_id)
    values (p_email, p_role, auth.uid(), now_ms, caller_tenant)
    on conflict (email) do update set
      role = excluded.role,
      granted_by = excluded.granted_by,
      tenant_id = excluded.tenant_id;
  end if;

  perform public.log_admin_action('provision_user', p_email, jsonb_build_object('role', p_role));
end;
$$;

-- Recreate handle_new_user (from 0003) copying tenant_id from the pending row.
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
    insert into public.profiles (id, email, display_name, avatar_url, role, created_at, tenant_id)
    values (
      new.id,
      new.email,
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'avatar_url',
      pending.role,
      (extract(epoch from now()) * 1000)::bigint,
      pending.tenant_id
    );
    delete from public.pending_profiles where email = new.email;
  end if;

  return new;
end;
$$;

-- Recreate admin_accept_access_request (from 0008) copying tenant_id from the
-- request row (stamped to the host tenant at insert time by the client).
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

  insert into public.profiles (id, email, display_name, avatar_url, role, created_at, tenant_id)
  values (req.id, req.email, req.display_name, req.avatar_url, 'member', now_ms, req.tenant_id)
  on conflict (id) do update set role = excluded.role;

  delete from public.access_requests where id = p_user_id;

  perform public.log_admin_action('accept_request', req.email, null);
end;
$$;
