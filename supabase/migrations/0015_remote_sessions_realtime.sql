-- Enable Realtime for remote_sessions so the agent receives INSERT events.
alter publication supabase_realtime add table remote_sessions;
alter table remote_sessions replica identity full;
