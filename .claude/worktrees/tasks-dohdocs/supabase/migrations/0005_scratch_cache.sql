create table public.scratch_cache (
  image_hash  text        primary key,
  result      jsonb       not null,
  created_at  timestamptz not null default now()
);

alter table public.scratch_cache enable row level security;
-- Only the service role (edge function) reads/writes this table.
-- No user-facing policies — service role bypasses RLS.
