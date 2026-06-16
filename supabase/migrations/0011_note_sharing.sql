-- Note and folder sharing: per-user ownership with share-based access control.
-- resolve_note_permission() is the single source of truth for all access decisions.

-- ---- Share tables ----

create table public.note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  grantee_type text not null check (grantee_type in ('user', 'group')),
  grantee_id uuid not null,
  permission text not null check (permission in ('edit', 'comment')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at bigint not null,
  unique (note_id, grantee_type, grantee_id)
);

create table public.folder_shares (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  grantee_type text not null check (grantee_type in ('user', 'group')),
  grantee_id uuid not null,
  permission text not null check (permission in ('edit', 'comment')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at bigint not null,
  unique (folder_id, grantee_type, grantee_id)
);

-- ---- Permission resolution function ----
-- Resolution order:
--   1. Owner → 'owner'
--   2. Note-level grants (direct user + group expansion) → most permissive
--   3. Folder-level grants → most permissive
--   Note-level overrides folder-level entirely (in either direction).

create or replace function public.resolve_note_permission(p_note_id uuid, p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  with
  note_info as (
    select owner_id, folder_id from public.notes where id = p_note_id
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
      when (select owner_id from note_info) = p_user_id
        then 'owner'
      when exists (select 1 from note_grants)
        then case when 'edit' in (select permission from note_grants) then 'edit' else 'comment' end
      when exists (select 1 from folder_grants)
        then case when 'edit' in (select permission from folder_grants) then 'edit' else 'comment' end
      else null
    end
$$;

-- Batch helper: resolves permissions for multiple notes in one round-trip
create or replace function public.get_notes_effective_permissions(p_note_ids uuid[], p_user_id uuid)
returns table(note_id uuid, effective_permission text)
language sql
security definer
set search_path = public
stable
as $$
  select n as note_id, public.resolve_note_permission(n, p_user_id)
  from unnest(p_note_ids) as n
$$;

-- ---- Backfill null owner_ids ----
-- Existing notes/folders with no owner are assigned to the earliest admin.

update public.notes
set owner_id = (select id from public.profiles where role = 'admin' order by created_at limit 1)
where owner_id is null;

update public.folders
set owner_id = (select id from public.profiles where role = 'admin' order by created_at limit 1)
where owner_id is null;

-- ---- Replace notes RLS ----

drop policy if exists "notes: tasks app members manage all" on public.notes;

create policy "notes: owner or shared can select"
  on public.notes for select
  using (public.resolve_note_permission(id, auth.uid()) is not null);

create policy "notes: app members can insert own notes"
  on public.notes for insert
  with check (public.has_app_access('tasks') and auth.uid() = owner_id);

create policy "notes: owner or editor can update"
  on public.notes for update
  using (public.resolve_note_permission(id, auth.uid()) in ('owner', 'edit'));

create policy "notes: owner can delete"
  on public.notes for delete
  using (auth.uid() = owner_id);

-- ---- Replace folders RLS ----

drop policy if exists "folders: tasks app members manage all" on public.folders;

create policy "folders: owner or shared can select"
  on public.folders for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.folder_shares fs
      where fs.folder_id = id
        and (
          (fs.grantee_type = 'user' and fs.grantee_id = auth.uid())
          or (fs.grantee_type = 'group' and fs.grantee_id in (
            select gm.group_id from public.group_members gm where gm.user_id = auth.uid()
          ))
        )
    )
  );

create policy "folders: app members can insert own folders"
  on public.folders for insert
  with check (public.has_app_access('tasks') and auth.uid() = owner_id);

create policy "folders: owner can update"
  on public.folders for update
  using (auth.uid() = owner_id);

create policy "folders: owner can delete"
  on public.folders for delete
  using (auth.uid() = owner_id);

-- ---- note_shares RLS ----

alter table public.note_shares enable row level security;

create policy "note_shares: note owner or grantee can select"
  on public.note_shares for select
  using (
    exists (select 1 from public.notes where id = note_id and owner_id = auth.uid())
    or (grantee_type = 'user' and grantee_id = auth.uid())
    or (grantee_type = 'group' and grantee_id in (
      select group_id from public.group_members where user_id = auth.uid()
    ))
  );

create policy "note_shares: note owner can insert"
  on public.note_shares for insert
  with check (exists (select 1 from public.notes where id = note_id and owner_id = auth.uid()));

create policy "note_shares: note owner can update"
  on public.note_shares for update
  using (exists (select 1 from public.notes where id = note_id and owner_id = auth.uid()));

create policy "note_shares: note owner can delete"
  on public.note_shares for delete
  using (exists (select 1 from public.notes where id = note_id and owner_id = auth.uid()));

-- ---- folder_shares RLS ----

alter table public.folder_shares enable row level security;

create policy "folder_shares: folder owner or grantee can select"
  on public.folder_shares for select
  using (
    exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid())
    or (grantee_type = 'user' and grantee_id = auth.uid())
    or (grantee_type = 'group' and grantee_id in (
      select group_id from public.group_members where user_id = auth.uid()
    ))
  );

create policy "folder_shares: folder owner can insert"
  on public.folder_shares for insert
  with check (exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid()));

create policy "folder_shares: folder owner can update"
  on public.folder_shares for update
  using (exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid()));

create policy "folder_shares: folder owner can delete"
  on public.folder_shares for delete
  using (exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid()));
