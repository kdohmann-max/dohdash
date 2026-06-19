-- Make tenant-owned writes work without changing every client insert site.
--
-- tenant_id is NOT NULL (0017), but no existing client INSERT supplies it
-- (createDoc, createFolder, createGroup, addNoteShare, createDocComment,
-- grantAppAccess, log_admin_action, etc.). Defaulting tenant_id to
-- current_tenant_id() stamps the caller's tenant automatically:
--   * authenticated app users  -> their profile's tenant
--   * SECURITY DEFINER helpers (e.g. log_admin_action) -> still resolve via the
--     original caller's auth.uid(), so the actor's tenant is used
-- The RLS with-check (tenant_id = current_tenant_id()) is satisfied by the same
-- default, so inserts pass without any call-site change.
--
-- Exceptions where current_tenant_id() is NULL must still pass tenant_id
-- explicitly (the default is harmless there): access_requests (inserter has no
-- profile yet -- client stamps host tenant) and remote_projects (agent uses the
-- service role -- must stamp the tenant itself).

alter table public.profiles          alter column tenant_id set default public.current_tenant_id();
alter table public.app_access        alter column tenant_id set default public.current_tenant_id();
alter table public.pending_profiles  alter column tenant_id set default public.current_tenant_id();
alter table public.access_requests   alter column tenant_id set default public.current_tenant_id();
alter table public.admin_audit_log   alter column tenant_id set default public.current_tenant_id();
alter table public.notes             alter column tenant_id set default public.current_tenant_id();
alter table public.folders           alter column tenant_id set default public.current_tenant_id();
alter table public.doc_comments      alter column tenant_id set default public.current_tenant_id();
alter table public.groups            alter column tenant_id set default public.current_tenant_id();
alter table public.group_members     alter column tenant_id set default public.current_tenant_id();
alter table public.note_shares       alter column tenant_id set default public.current_tenant_id();
alter table public.folder_shares     alter column tenant_id set default public.current_tenant_id();
alter table public.remote_projects   alter column tenant_id set default public.current_tenant_id();
alter table public.remote_sessions   alter column tenant_id set default public.current_tenant_id();
