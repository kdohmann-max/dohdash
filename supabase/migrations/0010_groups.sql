-- Platform-level groups: admin-managed groups reusable by any DohDash app for sharing.
-- All authenticated users can read (for share target search); only admins can write.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at bigint not null
);

create table public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at bigint not null,
  primary key (group_id, user_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "groups: authenticated users can read"
  on public.groups for select
  using (auth.uid() is not null);

create policy "groups: admins can insert"
  on public.groups for insert
  with check (public.is_admin());

create policy "groups: admins can update"
  on public.groups for update
  using (public.is_admin());

create policy "groups: admins can delete"
  on public.groups for delete
  using (public.is_admin());

create policy "group_members: authenticated users can read"
  on public.group_members for select
  using (auth.uid() is not null);

create policy "group_members: admins can insert"
  on public.group_members for insert
  with check (public.is_admin());

create policy "group_members: admins can delete"
  on public.group_members for delete
  using (public.is_admin());
