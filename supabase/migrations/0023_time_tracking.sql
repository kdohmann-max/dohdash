-- 0023_time_tracking.sql — Time Tracker (worker) + Time Dashboard (admin/granted) data.
-- Tenant-owned: every table carries tenant_id + tenant-scoped RLS per the multi-tenancy mandate.
-- time_jobs is an INTERIM job list; when the Jobs app is built it supersedes this as the
-- job-tag source (see CLAUDE.md). job_label is denormalized onto entries so a row keeps its
-- job name even if the job is later archived/deleted.

-- ---- Permission helper: admin OR granted the dashboard app ----
-- Global SECURITY DEFINER (mirrors is_admin()); is_admin()/has_app_access() are already
-- tenant-scoped, so this is too. Centralizes the "can see everyone's time" rule.
create or replace function public.can_view_all_time()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_admin() or public.has_app_access('time-dashboard')
$$;

-- ============================ time_jobs ============================
create table public.time_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  archived boolean not null default false,
  tenant_id uuid not null default public.current_tenant_id()
             references public.tenants(id),
  created_at bigint not null
);

alter table public.time_jobs enable row level security;

-- Everyone in the tenant needs the dropdown.
create policy "time_jobs: read same-tenant"
  on public.time_jobs for select
  using (tenant_id = public.current_tenant_id());

create policy "time_jobs: managers insert"
  on public.time_jobs for insert
  with check (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_jobs: managers update"
  on public.time_jobs for update
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time())
  with check (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_jobs: managers delete"
  on public.time_jobs for delete
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time());

-- ============================ time_entries ============================
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_date date not null,
  entry_mode text not null check (entry_mode in ('range', 'hours')),
  start_minutes int,
  end_minutes int,
  break_minutes int not null default 0,
  net_minutes int not null,
  job_id uuid references public.time_jobs(id) on delete set null,
  job_label text not null,
  note text,
  paid boolean not null default false,
  paid_at bigint,
  paid_by uuid references public.profiles(id) on delete set null,
  tenant_id uuid not null default public.current_tenant_id()
             references public.tenants(id),
  created_at bigint not null,
  updated_at bigint not null
);

create index time_entries_user_date_idx on public.time_entries (tenant_id, user_id, work_date);

alter table public.time_entries enable row level security;

-- Workers see their own rows; dashboard users (admin/granted) see all same-tenant rows.
create policy "time_entries: own or dashboard read"
  on public.time_entries for select
  using (tenant_id = public.current_tenant_id()
         and (user_id = auth.uid() or public.can_view_all_time()));

-- Only the worker logs their own time, and only with the worker-app gate.
create policy "time_entries: worker insert own"
  on public.time_entries for insert
  with check (tenant_id = public.current_tenant_id()
              and user_id = auth.uid()
              and public.has_app_access('time-tracker'));

-- Worker edits own; dashboard users can correct/mark paid on anyone's (same tenant).
create policy "time_entries: own or dashboard update"
  on public.time_entries for update
  using (tenant_id = public.current_tenant_id()
         and (user_id = auth.uid() or public.can_view_all_time()))
  with check (tenant_id = public.current_tenant_id()
              and (user_id = auth.uid() or public.can_view_all_time()));

create policy "time_entries: own or dashboard delete"
  on public.time_entries for delete
  using (tenant_id = public.current_tenant_id()
         and (user_id = auth.uid() or public.can_view_all_time()));

-- ============================ time_rates ============================
create table public.time_rates (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  hourly_rate numeric(10, 2),
  updated_at bigint not null,
  updated_by uuid references public.profiles(id) on delete set null,
  tenant_id uuid not null default public.current_tenant_id()
             references public.tenants(id)
);

alter table public.time_rates enable row level security;

-- Pay-sensitive: only dashboard users (admin/granted) can read or write rates.
create policy "time_rates: dashboard read"
  on public.time_rates for select
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_rates: dashboard insert"
  on public.time_rates for insert
  with check (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_rates: dashboard update"
  on public.time_rates for update
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time())
  with check (tenant_id = public.current_tenant_id() and public.can_view_all_time());

create policy "time_rates: dashboard delete"
  on public.time_rates for delete
  using (tenant_id = public.current_tenant_id() and public.can_view_all_time());
