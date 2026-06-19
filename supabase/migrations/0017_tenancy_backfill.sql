-- Stamp all existing rows to tenant #1 (Doh Built), THEN enforce NOT NULL.
-- Order matters: backfill before NOT NULL or the constraint rejects existing rows.

do $$
declare built uuid;
begin
  select id into built from public.tenants where slug = 'built';

  update public.profiles         set tenant_id = built where tenant_id is null;
  update public.app_access       set tenant_id = built where tenant_id is null;
  update public.pending_profiles set tenant_id = built where tenant_id is null;
  update public.access_requests  set tenant_id = built where tenant_id is null;
  update public.admin_audit_log  set tenant_id = built where tenant_id is null;
  update public.notes            set tenant_id = built where tenant_id is null;
  update public.folders          set tenant_id = built where tenant_id is null;
  update public.doc_comments     set tenant_id = built where tenant_id is null;
  update public.groups           set tenant_id = built where tenant_id is null;
  update public.group_members    set tenant_id = built where tenant_id is null;
  update public.note_shares      set tenant_id = built where tenant_id is null;
  update public.folder_shares    set tenant_id = built where tenant_id is null;
  update public.remote_projects  set tenant_id = built where tenant_id is null;
  update public.remote_sessions  set tenant_id = built where tenant_id is null;
end $$;

alter table public.profiles         alter column tenant_id set not null;
alter table public.app_access       alter column tenant_id set not null;
alter table public.pending_profiles alter column tenant_id set not null;
alter table public.access_requests  alter column tenant_id set not null;
alter table public.admin_audit_log  alter column tenant_id set not null;
alter table public.notes            alter column tenant_id set not null;
alter table public.folders          alter column tenant_id set not null;
alter table public.doc_comments     alter column tenant_id set not null;
alter table public.groups           alter column tenant_id set not null;
alter table public.group_members    alter column tenant_id set not null;
alter table public.note_shares      alter column tenant_id set not null;
alter table public.folder_shares    alter column tenant_id set not null;
alter table public.remote_projects  alter column tenant_id set not null;
alter table public.remote_sessions  alter column tenant_id set not null;

-- Helpful indexes for tenant-scoped reads.
create index on public.notes (tenant_id);
create index on public.folders (tenant_id);
create index on public.app_access (tenant_id);
create index on public.profiles (tenant_id);
