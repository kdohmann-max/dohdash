-- Fix: "infinite recursion detected in policy for relation \"folders\"" (42P17).
--
-- The 0011 folders SELECT policy queried folder_shares inline, and the
-- folder_shares SELECT policy queries folders inline — so evaluating either
-- table's RLS re-entered the other's RLS forever. The notes side never
-- recursed because it routes through resolve_note_permission(), a
-- SECURITY DEFINER function whose internal table reads bypass RLS.
--
-- Apply the same pattern to folders: resolve access in a SECURITY DEFINER
-- helper so the folder_shares lookup inside it does not re-trigger folders RLS.

create or replace function public.resolve_folder_permission(p_folder_id uuid, p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  with
  folder_info as (
    select owner_id from public.folders where id = p_folder_id
  ),
  user_groups as (
    select group_id from public.group_members where user_id = p_user_id
  ),
  folder_grants as (
    select permission from public.folder_shares
    where folder_id = p_folder_id
      and (
        (grantee_type = 'user'  and grantee_id = p_user_id)
        or (grantee_type = 'group' and grantee_id in (select group_id from user_groups))
      )
  )
  select
    case
      when (select owner_id from folder_info) = p_user_id
        then 'owner'
      when exists (select 1 from folder_grants)
        then case when 'edit' in (select permission from folder_grants) then 'edit' else 'comment' end
      else null
    end
$$;

-- Replace the recursive inline SELECT policy with the helper-backed one.
drop policy if exists "folders: owner or shared can select" on public.folders;

create policy "folders: owner or shared can select"
  on public.folders for select
  using (public.resolve_folder_permission(id, auth.uid()) is not null);
