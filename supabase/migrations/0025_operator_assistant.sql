-- 0025_operator_assistant.sql — the platform operator's in-dashboard coding assistant.
--
-- Global / cross-tenant-none by design (same Template B rationale as
-- 0024_operator_control_plane): these tables hold the OPERATOR's private assistant
-- data — conversations about the DohDash product itself, agent runs against the
-- codebase, and their streamed transcripts. This is NOT tenant-owned app data, so
-- it carries NO tenant_id and is gated by is_super_admin(), never
-- current_tenant_id(). Zero crossover with any tenant, by construction.
--
-- Transport mirrors Remote Claude (0014/0015): the web app INSERTs a pending run,
-- the local agent (service role — bypasses RLS) claims it, streams messages back,
-- and the operator approves before anything is committed/pushed. Runs + messages
-- are added to the realtime publication so the dashboard streams the run live.

-- A chat thread, scoped to one discovered project (repo). project_id reuses the
-- agent-maintained remote_projects list (same FK Remote Claude's sessions use).
create table operator_conversations (
  id         uuid   primary key default gen_random_uuid(),
  project_id text   references remote_projects(id) not null,
  title      text   not null default 'New conversation',
  created_at bigint not null,
  updated_at bigint not null
);

alter table operator_conversations enable row level security;

create policy "operator conversations: super admin all"
  on operator_conversations for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- One agent run: the queue item the local agent claims, and the unit the operator
-- approves. The agent works on `branch`, writes the proposed `diff`, and sets
-- status to 'awaiting_approval'. NOTHING is pushed until the operator approves
-- (status -> 'approved'), at which point the agent commits/pushes (-> 'deployed').
-- This no-push-without-approval gate is the whole safety model — a push auto-deploys.
create table operator_runs (
  id              uuid   primary key default gen_random_uuid(),
  conversation_id uuid   references operator_conversations(id) on delete cascade not null,
  project_id      text   references remote_projects(id) not null, -- denormalized so the agent polls without a join
  prompt          text   not null,     -- the task the operator asked for
  status          text   not null default 'pending'
                    check (status in ('pending','running','awaiting_approval','approved','deploying','deployed','discarded','error')),
  model           text   not null default 'claude-opus-4-8',
  effort          text   not null default 'high',
  branch          text,                -- working branch the agent created
  diff            text,                -- proposed patch, populated at awaiting_approval
  summary         text,                -- short assistant summary of the change
  error_message   text,
  created_at      bigint not null,
  started_at      bigint,
  finished_at     bigint
);

alter table operator_runs enable row level security;

create policy "operator runs: super admin all"
  on operator_runs for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- The streamed transcript. The agent inserts assistant/tool/status rows as it
-- works (service role); the operator's kickoff message is a 'user' row.
create table operator_messages (
  id              uuid   primary key default gen_random_uuid(),
  conversation_id uuid   references operator_conversations(id) on delete cascade not null,
  run_id          uuid   references operator_runs(id) on delete cascade,
  kind            text   not null check (kind in ('user','assistant','tool','status','error')),
  content         text   not null,
  created_at      bigint not null
);

alter table operator_messages enable row level security;

create policy "operator messages: super admin all"
  on operator_messages for all
  to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- Realtime: the dashboard streams the transcript (message INSERTs) and run
-- status/diff changes (run UPDATEs) live. Mirrors 0015.
alter publication supabase_realtime add table operator_messages;
alter table operator_messages replica identity full;
alter publication supabase_realtime add table operator_runs;
alter table operator_runs replica identity full;
