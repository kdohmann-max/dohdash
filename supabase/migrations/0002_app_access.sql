-- app_access: which apps (string ids into the code-defined APP_REGISTRY,
-- src/apps/registry.ts) each user may launch. This is the coarse "can open
-- this app" gate. A future app_resource_access table can layer finer
-- per-resource permissions (e.g. folder access within an app) on top of this
-- one purely additively, without changing this table or its policies.

create table public.app_access (
  user_id uuid not null references public.profiles (id) on delete cascade,
  app_id text not null,
  granted_by uuid references public.profiles (id),
  created_at bigint not null,
  primary key (user_id, app_id)
);

alter table public.app_access enable row level security;

create policy "app_access: read own grants"
  on public.app_access for select
  using (auth.uid() = user_id);

create policy "app_access: admins manage all"
  on public.app_access for all
  using (public.is_admin())
  with check (public.is_admin());
