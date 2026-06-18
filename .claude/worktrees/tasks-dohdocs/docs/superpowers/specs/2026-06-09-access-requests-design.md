# Access Requests — Self-Service Onboarding

## Problem

Today, access is granted only by an admin pre-authorizing an email via "Grant
access" (`pending_profiles`, migration `0003_pending_profiles.sql`). If
someone signs in with Google *without* being pre-authorized, they land on
`PendingAccessPage` and are told to email the admin contact — but no record
of that attempt exists anywhere an admin can see or act on.

This adds a self-service request flow: an unrecognized sign-in creates a
visible "access request" that an admin can Accept (grants `member` access) or
Reject (dismisses it; the person can sign in and re-request later).

This is additive — the existing admin-initiated "Grant access by email" /
`pending_profiles` flow is unchanged and continues to work for both orderings
(admin grants first, or user signs in first).

## Database

New migration `supabase/migrations/0006_access_requests.sql`:

```sql
create table public.access_requests (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  requested_at bigint not null
);

alter table public.access_requests enable row level security;

create policy "access_requests: insert own"
  on public.access_requests for insert
  with check (auth.uid() = id);

create policy "access_requests: admins manage all"
  on public.access_requests for all
  using (public.is_admin())
  with check (public.is_admin());
```

- One row per `auth.users` id — `on delete cascade` cleans it up if the auth
  user is ever deleted.
- "insert own" lets a freshly-signed-in, not-yet-provisioned user create their
  own request row. There's no "select own"/"update own" policy — the user
  never needs to read or modify it after creating it; re-creation on repeat
  sign-ins is handled via upsert + `ignoreDuplicates` (see below), which only
  needs insert privilege.
- "admins manage all" covers admin select + delete (Reject) + the row read
  inside the accept RPC.

New RPC, same migration:

```sql
create or replace function public.admin_accept_access_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.access_requests;
  now_ms bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if not public.is_admin() then
    raise exception 'admin_accept_access_request: permission denied';
  end if;

  select * into req from public.access_requests where id = p_user_id;
  if not found then
    raise exception 'admin_accept_access_request: no request for user %', p_user_id;
  end if;

  insert into public.profiles (id, email, display_name, avatar_url, role, created_at)
  values (req.id, req.email, req.display_name, req.avatar_url, 'member', now_ms)
  on conflict (id) do update set role = excluded.role;

  delete from public.access_requests where id = p_user_id;
end;
$$;
```

- Always grants role `member` per the agreed default; admins can promote via
  the existing "Make admin" toggle afterward.
- `on conflict (id) do update` mirrors `admin_provision_user`'s defensive
  handling of an already-existing profile (shouldn't normally happen, but
  keeps this idempotent/safe).
- Reject does **not** need an RPC — `delete from access_requests where id =
  ...` is covered directly by the "admins manage all" policy via the existing
  `supabase-js` client.

## Request creation — `PendingAccessPage.tsx`

When `useAuth().state.status === "pending-access"`, an effect fires once per
mount and upserts the current user's request row:

```ts
useEffect(() => {
  if (state.status !== "pending-access") return;
  const { id, email, user_metadata } = state.session.user;
  void createAccessRequest({
    id,
    email: email ?? "",
    displayName: (user_metadata?.full_name as string | undefined) ?? null,
    avatarUrl: (user_metadata?.avatar_url as string | undefined) ?? null,
  });
}, [state]);
```

`createAccessRequest` in `db.ts` upserts with `onConflict: "id",
ignoreDuplicates: true` — safe to call on every mount/re-render without
creating duplicates or needing to check existence first. Errors are swallowed
(best-effort; the page already shows the "contact admin" fallback regardless
of whether the request row was recorded).

## `db.ts` additions

```ts
export interface AccessRequest {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  requestedAt: number;
}

export async function createAccessRequest(req: {
  id: string; email: string; displayName: string | null; avatarUrl: string | null;
}): Promise<void>;

export async function listAccessRequests(): Promise<AccessRequest[]>;

export async function acceptAccessRequest(userId: string): Promise<void>; // RPC call
export async function rejectAccessRequest(userId: string): Promise<void>; // delete
```

Follows the existing `*RowTo*` mapper pattern used for `Profile` /
`PendingProfile`.

## Admin UI — `AdminDashboard.tsx`

- `AdminDashboard`'s existing `Promise.all` load also calls
  `listAccessRequests()`; result threaded into `UsersTab` as a new
  `accessRequests` prop, alongside `profiles` and `pending`.
- New "Access requests" section in `UsersTab`, rendered above "Pending
  invitations" (it's the more time-sensitive of the two — these are real
  people waiting at the door right now). Hidden entirely when empty, same as
  "Pending invitations".
- Each row: avatar (or initial-letter placeholder, matching the People table
  pattern) + display name + email + requested time, then **Accept** /
  **Reject** buttons.
  - Accept → `acceptAccessRequest(id)` → `reload()`.
  - Reject → `rejectAccessRequest(id)` → `reload()`.
  - Both wrapped in try/catch setting the existing `error` state on failure,
    matching `handleRoleToggle`/`handleCancelPending`.
- Styling: Accept uses `--accent` (primary action), Reject uses `--error`
  (destructive), per the styleguide. New rules added to
  `AdminDashboard.css` alongside `.admin-pending-row` /
  `.admin-role-badge`; reuses `.admin-avatar` / `.admin-avatar--placeholder`
  from the People table.

## Out of scope

- No email notifications to the requester on accept/reject.
- No permanent block list for rejected users (per agreed behavior, they can
  simply sign in and re-request).
- No admin-time role picker on Accept (always `member`; promote afterward via
  existing toggle).
