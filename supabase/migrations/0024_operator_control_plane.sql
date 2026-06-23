-- 0024_operator_control_plane.sql — super-admin (platform operator) control plane.
--
-- Global / cross-tenant by design (Template B in /new-migration): the `tenants`
-- table is the one place a single operator reaches ACROSS tenants, so its access
-- is gated by is_super_admin(), NOT by current_tenant_id(). This is intentional
-- and not a violation of the multi-tenancy mandate — tenants is the tenancy
-- registry itself, not tenant-owned app data.
--
-- Additive only: a helper, RLS policies on the existing `tenants` table, one
-- cross-tenant provisioning RPC, and a one-row seed setting the operator flag.

-- Caller is the platform operator. SECURITY DEFINER to bypass RLS on profiles
-- (mirrors is_admin() in 0001). super_admin column added in 0020, default false.
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

-- RLS on `tenants` (enabled since 0016, previously no authenticated policy — only
-- the anon SECURITY DEFINER RPCs get_tenant_public_config / get_tenant_id_for_host
-- read it, and those bypass RLS). Grant the operator full read + create + edit.
-- No DELETE policy: tenant deletion is out of scope (it would cascade across 14
-- tenant-owned tables; revisit behind a hard confirmation + backup gate).
create policy "tenants: super admin read"
  on public.tenants for select
  using (public.is_super_admin());

create policy "tenants: super admin insert"
  on public.tenants for insert
  with check (public.is_super_admin());

create policy "tenants: super admin update"
  on public.tenants for update
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Provision a NEW tenant's first admin. This is the only path that can stamp a
-- FOREIGN tenant_id onto a pending_profiles row: a direct insert would be blocked
-- by pending_profiles RLS and the column default would stamp the operator's own
-- tenant. handle_new_user (0020) promotes the pending row to an admin profile on
-- that admin's first Google sign-in. No audit write here — log_admin_action would
-- stamp the operator's tenant, not the target's (operator-audit is a later concern).
create or replace function public.super_admin_provision_first_admin(
  p_tenant_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not public.is_super_admin() then
    raise exception 'super_admin_provision_first_admin: permission denied';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'super_admin_provision_first_admin: no tenant %', p_tenant_id;
  end if;

  insert into public.pending_profiles (email, role, granted_by, created_at, tenant_id)
  values (p_email, 'admin', auth.uid(), now_ms, p_tenant_id)
  on conflict (email) do update set
    role = 'admin',
    granted_by = excluded.granted_by,
    tenant_id = excluded.tenant_id;
end;
$$;

grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.super_admin_provision_first_admin(uuid, text) to authenticated;

-- Seed the platform operator flag (same hardcoded-operator pattern the tenancy
-- seed migrations use). Idempotent.
update public.profiles set super_admin = true where email = 'kdohmann@gmail.com';
