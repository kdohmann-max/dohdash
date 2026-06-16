# DohDocs Sharing & Platform Groups — Design Spec

**Date:** 2026-06-15  
**Status:** Approved  
**Scope:** Platform-level Groups system + per-user note ownership + note/folder sharing in DohDocs

---

## Overview

Two interconnected features:

1. **Platform Groups** — admin-managed user groups, living at the DohDash shell level so any future app can use them for sharing or permissions.
2. **DohDocs Sharing** — per-user note ownership (private by default), sharing at note and folder level, two permission tiers, filtered sidebar views.

---

## Section 1: Platform Groups

### Database Tables

```sql
groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at bigint NOT NULL
)

group_members (
  group_id uuid REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  added_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  added_at bigint NOT NULL,
  PRIMARY KEY (group_id, user_id)
)
```

### RLS

- **SELECT** on both tables: any authenticated user (needed to discover groups when sharing)
- **INSERT / UPDATE / DELETE**: `is_admin()` only

### Admin Panel

New **Groups** tab in `AdminDashboard.tsx` alongside Users / App Access / Activity. Component: `src/admin/GroupsPanel.tsx`.

**Layout:**
- Left column: list of all groups — name, member count, created-by. "New Group" button.
- Right column (detail pane): opens on group selection.
  - Editable name and description (inline save)
  - Member list with avatar, display name, email, Remove button
  - "Add member" type-ahead searching profiles by name/email
  - "Delete group" destructive button with confirmation

**Guardrails:**
- Deleting a group leaves `note_shares`/`folder_shares` rows intact. The shares resolve to no access (no members remain) — no silent transfer of permissions.
- Duplicate group names trigger a UI warning on create; not enforced at DB level.

### `db.ts` — Groups (platform layer)

```ts
interface Group { id: string; name: string; description: string | null; createdBy: string | null; createdAt: number }
interface GroupMember { groupId: string; userId: string; displayName: string | null; avatarUrl: string | null; addedBy: string | null; addedAt: number }

listGroups(): Promise<Group[]>
createGroup(name: string, description: string | null, createdBy: string): Promise<Group>
updateGroup(id: string, name: string, description: string | null): Promise<void>
deleteGroup(id: string): Promise<void>
listGroupMembers(groupId: string): Promise<GroupMember[]>   // joins profiles
addGroupMember(groupId: string, userId: string, addedBy: string): Promise<void>
removeGroupMember(groupId: string, userId: string): Promise<void>
listMyGroups(userId: string): Promise<Group[]>              // for sharing UI
```

---

## Section 2: Share Tables, Permission Function & Migration

### Share Tables

```sql
note_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid REFERENCES notes(id) ON DELETE CASCADE,
  grantee_type text NOT NULL CHECK (grantee_type IN ('user', 'group')),
  grantee_id uuid NOT NULL,
  permission text NOT NULL CHECK (permission IN ('edit', 'comment')),
  granted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at bigint NOT NULL,
  UNIQUE (note_id, grantee_type, grantee_id)
)

folder_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES folders(id) ON DELETE CASCADE,
  grantee_type text NOT NULL CHECK (grantee_type IN ('user', 'group')),
  grantee_id uuid NOT NULL,
  permission text NOT NULL CHECK (permission IN ('edit', 'comment')),
  granted_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at bigint NOT NULL,
  UNIQUE (folder_id, grantee_type, grantee_id)
)
```

### Permission Resolution Function

`SECURITY DEFINER` function, callable by any future DohDash app:

```sql
CREATE OR REPLACE FUNCTION public.resolve_note_permission(p_note_id uuid, p_user_id uuid)
RETURNS text  -- 'owner' | 'edit' | 'comment' | null
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  -- 1. Owner check
  -- 2. Collect note-level grants (direct user + group membership expansion)
  -- 3. Collect folder-level grants (same expansion on note's folder_id)
  -- 4. If note-level grants exist → return most permissive ('edit' beats 'comment')
  -- 5. Else if folder-level grants exist → return most permissive
  -- 6. Else → null
$$;
```

**Resolution rules:**
- Note-level grants override folder-level grants entirely (in either direction — can upgrade or downgrade)
- Within the same level, most permissive wins across all applicable grants (direct user + all groups the user belongs to)
- `'edit'` is more permissive than `'comment'`

### Migration — Existing Notes

One-time migration SQL:

```sql
-- Assign null-owner notes to the earliest admin
UPDATE notes
SET owner_id = (
  SELECT id FROM profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1
)
WHERE owner_id IS NULL;
```

Notes with a valid `owner_id` automatically become private to their owner when RLS policies are replaced — no data change needed. If no admin exists (edge case), null-owner notes remain null and are readable only via an `is_admin()` bypass in the SELECT policy.

---

## Section 3: RLS Policies

Replaces the current blanket "tasks app members manage all" policies on `notes` and `folders`.

### `notes`

| Op | Policy |
|----|--------|
| SELECT | `resolve_note_permission(id, auth.uid()) IS NOT NULL` |
| INSERT | `has_app_access('tasks') AND auth.uid() = owner_id` |
| UPDATE | `resolve_note_permission(id, auth.uid()) IN ('owner', 'edit')` |
| DELETE | `auth.uid() = owner_id` |

### `folders`

| Op | Policy |
|----|--------|
| SELECT | `auth.uid() = owner_id` OR has a `folder_shares` row for this user or any of their groups |
| INSERT | `has_app_access('tasks') AND auth.uid() = owner_id` |
| UPDATE | `auth.uid() = owner_id` |
| DELETE | `auth.uid() = owner_id` |

### `note_shares` / `folder_shares`

| Op | Policy |
|----|--------|
| SELECT | owner of the note/folder OR the grantee themselves |
| INSERT / UPDATE / DELETE | owner of the note/folder only |

### `groups` / `group_members`

| Op | Policy |
|----|--------|
| SELECT | any authenticated user |
| INSERT / UPDATE / DELETE | `is_admin()` |

---

## Section 4: DohDocs Sidebar — Filtered Views

### View Modes

Persisted to `localStorage` (`dohdash-tasks-view`).

| Mode | Filter | Folder tree |
|------|--------|-------------|
| **Mine** (default) | `owner_id = auth.uid()` | Full owned folder hierarchy |
| **Shared with me** | `owner_id != auth.uid()` (RLS gates visibility) | No folder tree — grouped by owner display name |
| **All** | No owner filter | Owned folders + flat "Shared" section for unowned notes |

### Sidebar Toggle

Segmented control `Mine | Shared | All` placed above the existing search bar.

### `listDocs` Signature Change

```ts
listDocs(query?: string, view?: 'mine' | 'shared' | 'all', userId?: string): Promise<DocMeta[]>
```

`DocMeta` gains three optional fields:
```ts
ownerName: string | null        // for Shared/All views
ownerAvatarUrl: string | null
effectivePermission: 'owner' | 'edit' | 'comment'  // for Shared view badge
```

The `shared` view query joins `profiles` on `owner_id` and calls `resolve_note_permission(id, auth.uid())` in the SELECT.

---

## Section 5: Sharing UI

### Note Sharing — `SharePanel`

Triggered by a share icon button in the Editor toolbar. Slides in from the right, same pattern as `CommentsPanel`.

**Contents:**
- "You (Owner)" row at top — non-removable
- Existing shares list — grantee name, user/group badge, permission badge; owner can change permission inline or remove
- Search field — type-ahead across `profiles` and `groups` by name/email, shows user avatar or group icon
- Permission selector — `Full Edit` / `Comment Only` (chosen before adding)
- Add button — writes to `note_shares`

### Folder Sharing — `FolderShareModal`

Triggered from the sidebar folder context menu (existing `...` menu that already has Rename/Delete). Adds a "Share folder" option. Opens a modal (not a slide-in panel).

Same type-ahead + permission selector as SharePanel, lists current `folder_shares`, writes to `folder_shares`.

### Visual Indicators in Sidebar

- Notes shared *by* you: faint share icon next to the title
- Notes shared *with* you: owner avatar thumbnail in the sidebar row (Shared + All views)
- Folders with active shares: faint share icon next to folder name

### Permission Enforcement in Editor

When `effectivePermission === 'comment'` for the current user:
- TipTap `editable: false`
- Toolbar hides all formatting controls
- Comment button remains visible and active
- Subtle read-only banner below the title: "You have comment-only access"

---

## Section 6: `db.ts` — Shares (DohDocs Layer)

```ts
type Permission = 'edit' | 'comment'
type GranteeType = 'user' | 'group'

interface NoteShare {
  id: string; noteId: string;
  granteeType: GranteeType; granteeId: string; granteeName: string | null;
  permission: Permission; grantedBy: string | null; createdAt: number;
}

interface FolderShare {
  id: string; folderId: string;
  granteeType: GranteeType; granteeId: string; granteeName: string | null;
  permission: Permission; grantedBy: string | null; createdAt: number;
}

listNoteShares(noteId: string): Promise<NoteShare[]>
addNoteShare(noteId: string, granteeType: GranteeType, granteeId: string,
             permission: Permission, grantedBy: string): Promise<void>
updateNoteShare(id: string, permission: Permission): Promise<void>
removeNoteShare(id: string): Promise<void>

listFolderShares(folderId: string): Promise<FolderShare[]>
addFolderShare(folderId: string, granteeType: GranteeType, granteeId: string,
               permission: Permission, grantedBy: string): Promise<void>
updateFolderShare(id: string, permission: Permission): Promise<void>
removeFolderShare(id: string): Promise<void>
```

All share functions go in `src/storage/db.ts`. No direct Supabase calls in UI components.

---

## Migration Path Summary

1. New migration: create `groups`, `group_members`, `note_shares`, `folder_shares`
2. New migration: add `resolve_note_permission` SQL function
3. New migration: drop old blanket RLS policies; add new per-ownership policies
4. New migration: `UPDATE notes SET owner_id = <first-admin> WHERE owner_id IS NULL`
5. New migration: add RLS to `note_shares`, `folder_shares`, `groups`, `group_members`

Migrations run in order via `supabase db push`. No source changes are needed to existing data.

---

## File Inventory

**New files:**
- `supabase/migrations/0010_groups.sql` — `groups`, `group_members` tables + RLS
- `supabase/migrations/0011_note_sharing.sql` — `note_shares`, `folder_shares` tables + `resolve_note_permission` function + drop/replace `notes`/`folders` RLS policies + null-owner backfill
- `src/admin/GroupsPanel.tsx` + `GroupsPanel.css`
- `src/apps/tasks/components/SharePanel.tsx` + `SharePanel.css`
- `src/apps/tasks/components/FolderShareModal.tsx` + `FolderShareModal.css`

**Modified files:**
- `src/storage/db.ts` — groups + share functions; `listDocs` view param; `DocMeta` extended
- `src/admin/AdminDashboard.tsx` — Groups tab
- `src/apps/tasks/TasksApp.tsx` — view mode state + pass-through to Sidebar
- `src/apps/tasks/components/Sidebar.tsx` — `Mine | Shared | All` toggle; owner indicators
- `src/apps/tasks/components/Editor.tsx` — SharePanel trigger; comment-only read-only mode
- `.claude/context/dohdash.md` — groups tables
- `.claude/context/tasks.md` — sharing, view modes, SharePanel, FolderShareModal
