-- notes & folders: the shared workspace backing the "DohDocs" app (app_id
-- 'tasks' in app_access — see public/CompanyInfo.md's appNames map for the
-- display-name override; the id stays 'tasks' so existing app_access grants
-- aren't orphaned). Unlike profiles/app_access, rows here aren't
-- owner-isolated: any user granted the app can read and edit every note and
-- folder, matching the small shared-team-notes model the editor was built for.

-- SECURITY DEFINER bypasses RLS on the inner query, mirroring is_admin() in
-- 0001 — lets a policy on notes/folders check app_access without each table's
-- own RLS getting in the way of the lookup.
create or replace function public.has_app_access(check_app_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_access
    where user_id = auth.uid() and app_id = check_app_id
  );
$$;

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.folders (id) on delete cascade,
  created_at bigint not null,
  owner_id uuid references public.profiles (id) on delete set null
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  markdown text not null default '',
  updated_at bigint not null,
  folder_id uuid references public.folders (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null
);

alter table public.folders enable row level security;
alter table public.notes enable row level security;

create policy "folders: tasks app members manage all"
  on public.folders for all
  using (public.has_app_access('tasks'))
  with check (public.has_app_access('tasks'));

create policy "notes: tasks app members manage all"
  on public.notes for all
  using (public.has_app_access('tasks'))
  with check (public.has_app_access('tasks'));
