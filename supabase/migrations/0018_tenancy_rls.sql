-- Tenant-scope every RLS policy on every tenant-owned table, and harden the
-- SECURITY DEFINER permission resolvers so they cannot leak across tenants.
-- After this migration, no session can read or write rows belonging to another
-- tenant. Existing owner/share/admin logic is preserved verbatim; the tenant
-- clause (tenant_id = current_tenant_id()) is layered on -- ANDed into `using`
-- for SELECT/UPDATE/DELETE and into `with check` for INSERT.
--
-- Deviations from the plan, deliberately made after reading each table's actual
-- current policies (documented inline where they occur):
--   * profiles: the extra "app members read directory" policy from 0009 is
--     dropped and folded into a tenant-scoped same-tenant read.
--   * resolve_folder_permission (0012) is hardened too -- the plan only named
--     resolve_note_permission, but the folder resolver is the same risk class.
--   * access_requests INSERT is NOT tenant-predicated: the inserting user has no
--     profile yet, so current_tenant_id() is NULL at that point. Its tenant_id
--     value is populated by the client/Phase 5 auth-binding work; here we only
--     tenant-scope the admin manage policy.

-- =====================================================================
-- Step 1: Harden the SECURITY DEFINER permission resolvers
-- =====================================================================

-- is_admin() already scopes to the caller's own profile row, which carries the
-- caller's tenant -- so "admin" is implicitly admin-of-own-tenant. No change
-- needed to is_admin() itself; the tenant wall is enforced by the policies that
-- ALSO require tenant_id = current_tenant_id() on the TARGET row (below).

-- resolve_note_permission: add an explicit tenant guard so a note_id from
-- another tenant resolves to null even though the function is DEFINER.
create or replace function public.resolve_note_permission(p_note_id uuid, p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  with
  note_info as (
    select owner_id, folder_id, tenant_id from public.notes where id = p_note_id
  ),
  caller_tenant as (
    select tenant_id from public.profiles where id = p_user_id
  ),
  user_groups as (
    select group_id from public.group_members where user_id = p_user_id
  ),
  note_grants as (
    select permission from public.note_shares
    where note_id = p_note_id
      and (
        (grantee_type = 'user'  and grantee_id = p_user_id)
        or (grantee_type = 'group' and grantee_id in (select group_id from user_groups))
      )
  ),
  folder_grants as (
    select fs.permission
    from public.folder_shares fs
    join note_info ni on ni.folder_id = fs.folder_id
    where
      (fs.grantee_type = 'user'  and fs.grantee_id = p_user_id)
      or (fs.grantee_type = 'group' and fs.grantee_id in (select group_id from user_groups))
  )
  select
    case
      -- Tenant guard: caller and note must share a tenant, else no access.
      when (select tenant_id from note_info) is distinct from (select tenant_id from caller_tenant)
        then null
      when (select owner_id from note_info) = p_user_id
        then 'owner'
      when exists (select 1 from note_grants)
        then case when 'edit' in (select permission from note_grants) then 'edit' else 'comment' end
      when exists (select 1 from folder_grants)
        then case when 'edit' in (select permission from folder_grants) then 'edit' else 'comment' end
      else null
    end
$$;

-- get_notes_effective_permissions calls resolve_note_permission, so it inherits
-- the guard -- no change needed.

-- resolve_folder_permission: same tenant guard (the plan named only the note
-- resolver, but this DEFINER function is the same risk class).
create or replace function public.resolve_folder_permission(p_folder_id uuid, p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  with
  folder_info as (
    select owner_id, tenant_id from public.folders where id = p_folder_id
  ),
  caller_tenant as (
    select tenant_id from public.profiles where id = p_user_id
  ),
  user_groups as (
    select group_id from public.group_members where user_id = p_user_id
  ),
  folder_grants as (
    select permission from public.folder_shares
    where folder_id = p_folder_id
      and (
        (grantee_type = 'user'  and grantee_id = p_user_id)
        or (grantee_type = 'group' and grantee_id in (select group_id from user_groups))
      )
  )
  select
    case
      when (select tenant_id from folder_info) is distinct from (select tenant_id from caller_tenant)
        then null
      when (select owner_id from folder_info) = p_user_id
        then 'owner'
      when exists (select 1 from folder_grants)
        then case when 'edit' in (select permission from folder_grants) then 'edit' else 'comment' end
      else null
    end
$$;

-- =====================================================================
-- Step 2: profiles
-- =====================================================================

drop policy if exists "profiles: read own row" on public.profiles;
drop policy if exists "profiles: admins manage all" on public.profiles;
-- Folded into the tenant-scoped same-tenant read below (was: has_app_access('tasks')).
drop policy if exists "profiles: app members read directory" on public.profiles;

create policy "profiles: read own row"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles: read same-tenant rows"
  on public.profiles for select
  using (tenant_id = public.current_tenant_id());

create policy "profiles: admins manage same-tenant"
  on public.profiles for all
  using (public.is_admin() and tenant_id = public.current_tenant_id())
  with check (public.is_admin() and tenant_id = public.current_tenant_id());

-- =====================================================================
-- Step 3: app_access
-- =====================================================================

drop policy if exists "app_access: read own grants" on public.app_access;
drop policy if exists "app_access: admins manage all" on public.app_access;

create policy "app_access: read own grants"
  on public.app_access for select
  using (auth.uid() = user_id and tenant_id = public.current_tenant_id());

create policy "app_access: admins manage all"
  on public.app_access for all
  using (public.is_admin() and tenant_id = public.current_tenant_id())
  with check (public.is_admin() and tenant_id = public.current_tenant_id());

-- =====================================================================
-- Step 4: pending_profiles
-- =====================================================================

drop policy if exists "pending_profiles: admins manage all" on public.pending_profiles;

create policy "pending_profiles: admins manage all"
  on public.pending_profiles for all
  using (public.is_admin() and tenant_id = public.current_tenant_id())
  with check (public.is_admin() and tenant_id = public.current_tenant_id());

-- =====================================================================
-- Step 5: access_requests
-- =====================================================================
-- insert-own is intentionally NOT tenant-predicated: the inserting user has no
-- profile row yet, so current_tenant_id() would be NULL and reject the insert,
-- breaking self-service onboarding. tenant_id is set by the client/Phase 5.

drop policy if exists "access_requests: insert own" on public.access_requests;
drop policy if exists "access_requests: admins manage all" on public.access_requests;

create policy "access_requests: insert own"
  on public.access_requests for insert
  with check (auth.uid() = id);

create policy "access_requests: admins manage all"
  on public.access_requests for all
  using (public.is_admin() and tenant_id = public.current_tenant_id())
  with check (public.is_admin() and tenant_id = public.current_tenant_id());

-- =====================================================================
-- Step 6: admin_audit_log
-- =====================================================================

drop policy if exists "audit: admins read" on public.admin_audit_log;
drop policy if exists "audit: admins insert own" on public.admin_audit_log;

create policy "audit: admins read"
  on public.admin_audit_log for select
  using (public.is_admin() and tenant_id = public.current_tenant_id());

create policy "audit: admins insert own"
  on public.admin_audit_log for insert
  with check (public.is_admin() and actor_id = auth.uid()
              and tenant_id = public.current_tenant_id());

-- =====================================================================
-- Step 7: notes
-- =====================================================================

drop policy if exists "notes: owner or shared can select"      on public.notes;
drop policy if exists "notes: app members can insert own notes" on public.notes;
drop policy if exists "notes: owner or editor can update"       on public.notes;
drop policy if exists "notes: owner can delete"                 on public.notes;

create policy "notes: owner or shared can select"
  on public.notes for select
  using (tenant_id = public.current_tenant_id()
         and public.resolve_note_permission(id, auth.uid()) is not null);

create policy "notes: app members can insert own notes"
  on public.notes for insert
  with check (tenant_id = public.current_tenant_id()
              and public.has_app_access('tasks') and auth.uid() = owner_id);

create policy "notes: owner or editor can update"
  on public.notes for update
  using (tenant_id = public.current_tenant_id()
         and public.resolve_note_permission(id, auth.uid()) in ('owner', 'edit'));

create policy "notes: owner can delete"
  on public.notes for delete
  using (tenant_id = public.current_tenant_id() and auth.uid() = owner_id);

-- =====================================================================
-- Step 8: folders (SELECT policy is the 0012 resolver-backed version)
-- =====================================================================

drop policy if exists "folders: owner or shared can select"     on public.folders;
drop policy if exists "folders: app members can insert own folders" on public.folders;
drop policy if exists "folders: owner can update"               on public.folders;
drop policy if exists "folders: owner can delete"               on public.folders;

create policy "folders: owner or shared can select"
  on public.folders for select
  using (tenant_id = public.current_tenant_id()
         and public.resolve_folder_permission(id, auth.uid()) is not null);

create policy "folders: app members can insert own folders"
  on public.folders for insert
  with check (tenant_id = public.current_tenant_id()
              and public.has_app_access('tasks') and auth.uid() = owner_id);

create policy "folders: owner can update"
  on public.folders for update
  using (tenant_id = public.current_tenant_id() and auth.uid() = owner_id);

create policy "folders: owner can delete"
  on public.folders for delete
  using (tenant_id = public.current_tenant_id() and auth.uid() = owner_id);

-- =====================================================================
-- Step 9: note_shares
-- =====================================================================

drop policy if exists "note_shares: note owner or grantee can select" on public.note_shares;
drop policy if exists "note_shares: note owner can insert"            on public.note_shares;
drop policy if exists "note_shares: note owner can update"            on public.note_shares;
drop policy if exists "note_shares: note owner can delete"            on public.note_shares;

create policy "note_shares: note owner or grantee can select"
  on public.note_shares for select
  using (
    tenant_id = public.current_tenant_id()
    and (
      exists (select 1 from public.notes where id = note_id and owner_id = auth.uid())
      or (grantee_type = 'user' and grantee_id = auth.uid())
      or (grantee_type = 'group' and grantee_id in (
        select group_id from public.group_members where user_id = auth.uid()
      ))
    )
  );

create policy "note_shares: note owner can insert"
  on public.note_shares for insert
  with check (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.notes where id = note_id and owner_id = auth.uid())
  );

create policy "note_shares: note owner can update"
  on public.note_shares for update
  using (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.notes where id = note_id and owner_id = auth.uid())
  );

create policy "note_shares: note owner can delete"
  on public.note_shares for delete
  using (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.notes where id = note_id and owner_id = auth.uid())
  );

-- =====================================================================
-- Step 10: folder_shares
-- =====================================================================

drop policy if exists "folder_shares: folder owner or grantee can select" on public.folder_shares;
drop policy if exists "folder_shares: folder owner can insert"            on public.folder_shares;
drop policy if exists "folder_shares: folder owner can update"            on public.folder_shares;
drop policy if exists "folder_shares: folder owner can delete"            on public.folder_shares;

create policy "folder_shares: folder owner or grantee can select"
  on public.folder_shares for select
  using (
    tenant_id = public.current_tenant_id()
    and (
      exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid())
      or (grantee_type = 'user' and grantee_id = auth.uid())
      or (grantee_type = 'group' and grantee_id in (
        select group_id from public.group_members where user_id = auth.uid()
      ))
    )
  );

create policy "folder_shares: folder owner can insert"
  on public.folder_shares for insert
  with check (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid())
  );

create policy "folder_shares: folder owner can update"
  on public.folder_shares for update
  using (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid())
  );

create policy "folder_shares: folder owner can delete"
  on public.folder_shares for delete
  using (
    tenant_id = public.current_tenant_id()
    and exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid())
  );

-- =====================================================================
-- Step 11: doc_comments
-- =====================================================================

drop policy if exists "doc_comments: members read"          on public.doc_comments;
drop policy if exists "doc_comments: members insert own"    on public.doc_comments;
drop policy if exists "doc_comments: members update"        on public.doc_comments;
drop policy if exists "doc_comments: author or admin delete" on public.doc_comments;

create policy "doc_comments: members read"
  on public.doc_comments for select
  using (tenant_id = public.current_tenant_id() and public.has_app_access('tasks'));

create policy "doc_comments: members insert own"
  on public.doc_comments for insert
  with check (tenant_id = public.current_tenant_id()
              and public.has_app_access('tasks') and author_id = auth.uid());

create policy "doc_comments: members update"
  on public.doc_comments for update
  using (tenant_id = public.current_tenant_id() and public.has_app_access('tasks'))
  with check (tenant_id = public.current_tenant_id() and public.has_app_access('tasks'));

create policy "doc_comments: author or admin delete"
  on public.doc_comments for delete
  using (tenant_id = public.current_tenant_id()
         and public.has_app_access('tasks')
         and (author_id = auth.uid() or public.is_admin()));

-- =====================================================================
-- Step 12: groups
-- =====================================================================

drop policy if exists "groups: authenticated users can read" on public.groups;
drop policy if exists "groups: admins can insert"            on public.groups;
drop policy if exists "groups: admins can update"            on public.groups;
drop policy if exists "groups: admins can delete"            on public.groups;

create policy "groups: authenticated users can read"
  on public.groups for select
  using (auth.uid() is not null and tenant_id = public.current_tenant_id());

create policy "groups: admins can insert"
  on public.groups for insert
  with check (public.is_admin() and tenant_id = public.current_tenant_id());

create policy "groups: admins can update"
  on public.groups for update
  using (public.is_admin() and tenant_id = public.current_tenant_id());

create policy "groups: admins can delete"
  on public.groups for delete
  using (public.is_admin() and tenant_id = public.current_tenant_id());

-- =====================================================================
-- Step 13: group_members
-- =====================================================================

drop policy if exists "group_members: authenticated users can read" on public.group_members;
drop policy if exists "group_members: admins can insert"            on public.group_members;
drop policy if exists "group_members: admins can delete"            on public.group_members;

create policy "group_members: authenticated users can read"
  on public.group_members for select
  using (auth.uid() is not null and tenant_id = public.current_tenant_id());

create policy "group_members: admins can insert"
  on public.group_members for insert
  with check (public.is_admin() and tenant_id = public.current_tenant_id());

create policy "group_members: admins can delete"
  on public.group_members for delete
  using (public.is_admin() and tenant_id = public.current_tenant_id());

-- =====================================================================
-- Step 14: remote_projects (SELECT-only for users; agent upserts via service role)
-- =====================================================================

drop policy if exists "authenticated users can read projects" on public.remote_projects;

create policy "authenticated users can read projects"
  on public.remote_projects for select
  to authenticated
  using (tenant_id = public.current_tenant_id());

-- =====================================================================
-- Step 15: remote_sessions
-- =====================================================================

drop policy if exists "users can read own sessions"   on public.remote_sessions;
drop policy if exists "users can create own sessions" on public.remote_sessions;

create policy "users can read own sessions"
  on public.remote_sessions for select
  to authenticated
  using (user_id = auth.uid() and tenant_id = public.current_tenant_id());

create policy "users can create own sessions"
  on public.remote_sessions for insert
  to authenticated
  with check (user_id = auth.uid() and tenant_id = public.current_tenant_id());
