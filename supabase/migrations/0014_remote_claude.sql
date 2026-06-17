-- remote_projects: agent scans the Ai folder and upserts available projects.
-- The web app reads this to populate the project picker.
create table remote_projects (
  id        text   primary key,       -- slugified folder name
  name      text   not null,          -- display name (original folder name)
  path      text   not null,          -- absolute path on dev machine
  last_seen bigint not null           -- ms epoch; used to detect if agent is online
);

alter table remote_projects enable row level security;

-- Any authenticated user may read the project list.
create policy "authenticated users can read projects"
  on remote_projects for select
  to authenticated
  using (true);

-- remote_sessions: web app inserts, agent updates status.
create table remote_sessions (
  id            uuid   primary key default gen_random_uuid(),
  user_id       uuid   references profiles(id) on delete cascade not null,
  project_id    text   references remote_projects(id) not null,
  status        text   not null default 'pending', -- pending | starting | running | error
  error_message text,
  created_at    bigint not null,
  started_at    bigint
);

alter table remote_sessions enable row level security;

create policy "users can read own sessions"
  on remote_sessions for select
  to authenticated
  using (user_id = auth.uid());

create policy "users can create own sessions"
  on remote_sessions for insert
  to authenticated
  with check (user_id = auth.uid());
