-- doc_comments: Google-Docs-style comments on DohDocs documents. Root
-- comments anchor to a text selection (the editor stores a docComment mark
-- whose data-comment-id matches this table's id; anchor_text is a snapshot
-- of the selected text so the thread stays meaningful if the text is later
-- edited away). Replies set parent_id and have no anchor.
--
-- Same shared-team model as notes (migration 0004): any tasks-app member can
-- read, comment on, and resolve/re-open any thread. Deleting is restricted to
-- the comment's author or an admin.

create table public.doc_comments (
  id uuid primary key,  -- client-supplied so the editor mark's id is known before insert
  doc_id uuid not null references public.notes (id) on delete cascade,
  parent_id uuid references public.doc_comments (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  content text not null,
  anchor_text text,
  resolved_at bigint,
  created_at bigint not null,
  updated_at bigint
);

create index doc_comments_doc_id_idx on public.doc_comments (doc_id, created_at);

alter table public.doc_comments enable row level security;

create policy "doc_comments: members read"
  on public.doc_comments for select
  using (public.has_app_access('tasks'));

create policy "doc_comments: members insert own"
  on public.doc_comments for insert
  with check (public.has_app_access('tasks') and author_id = auth.uid());

-- Update covers edits and resolve/re-open; like notes, any member may
-- resolve any thread (Google-Docs behavior).
create policy "doc_comments: members update"
  on public.doc_comments for update
  using (public.has_app_access('tasks'))
  with check (public.has_app_access('tasks'));

create policy "doc_comments: author or admin delete"
  on public.doc_comments for delete
  using (public.has_app_access('tasks') and (author_id = auth.uid() or public.is_admin()));

-- Narrow directory read so comment author names/avatars (joined from
-- profiles) and realtime presence show real identities for non-admins —
-- profiles RLS is otherwise read-own + admins-manage-all (migration 0001).
create policy "profiles: app members read directory"
  on public.profiles for select
  using (public.has_app_access('tasks'));
