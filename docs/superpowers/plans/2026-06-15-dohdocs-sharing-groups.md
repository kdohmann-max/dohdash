# DohDocs Sharing & Platform Groups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-managed platform groups and per-user note/folder ownership with share-based access control to DohDocs.

**Architecture:** SQL `SECURITY DEFINER` function `resolve_note_permission()` encodes all permission logic server-side; RLS on `notes` and `folders` calls it directly so no client code path can bypass access control. Groups live at the DohDash shell level (separate `groups`/`group_members` tables) so any future app can target them for sharing. DohDocs gets a view-mode toggle (Mine / Shared / All) in the sidebar and owner-driven SharePanel/FolderShareModal UI.

**Tech Stack:** Supabase Postgres (RLS, SECURITY DEFINER functions, PostgREST), React 19 + TypeScript, TipTap editor, existing DohDash CSS design tokens.

**Spec:** `docs/superpowers/specs/2026-06-15-dohdocs-sharing-groups-design.md`

---

## File Map

| Status | File | Role |
|--------|------|------|
| Create | `supabase/migrations/0010_groups.sql` | `groups` + `group_members` tables + RLS |
| Create | `supabase/migrations/0011_note_sharing.sql` | Share tables + `resolve_note_permission` + new RLS + backfill |
| Modify | `src/storage/db.ts` | Groups + share CRUD; extend `DocMeta`/`Folder`; update `listDocs` |
| Create | `src/admin/GroupsPanel.tsx` | Admin UI: create/edit/delete groups, manage members |
| Create | `src/admin/GroupsPanel.css` | Styles for GroupsPanel |
| Modify | `src/admin/AdminDashboard.tsx` | Add Groups tab |
| Modify | `src/apps/tasks/TasksApp.tsx` | View mode state; pass view to listDocs; merge effectivePermission onto active doc |
| Modify | `src/apps/tasks/components/Sidebar.tsx` | Mine/Shared/All toggle; shared view grouped by owner; share indicators |
| Create | `src/apps/tasks/components/SharePanel.tsx` | Slide-in panel for managing note shares |
| Create | `src/apps/tasks/components/SharePanel.css` | Styles for SharePanel |
| Create | `src/apps/tasks/components/FolderShareModal.tsx` | Modal for managing folder shares |
| Create | `src/apps/tasks/components/FolderShareModal.css` | Styles for FolderShareModal |
| Modify | `src/apps/tasks/components/Editor.tsx` | Share button; SharePanel toggle; comment-only read-only mode |
| Modify | `src/apps/tasks/components/Toolbar.tsx` | Add `onShareOpen` prop |
| Modify | `.claude/context/dohdash.md` | Document groups tables |
| Modify | `.claude/context/tasks.md` | Document sharing, view modes, new components |

---

## Task 1: Migration — Groups Tables

**Files:**
- Create: `supabase/migrations/0010_groups.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Platform-level groups: admin-managed groups reusable by any DohDash app for sharing.
-- All authenticated users can read (for share target search); only admins can write.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at bigint not null
);

create table public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  added_at bigint not null,
  primary key (group_id, user_id)
);

alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "groups: authenticated users can read"
  on public.groups for select
  using (auth.uid() is not null);

create policy "groups: admins can insert"
  on public.groups for insert
  with check (public.is_admin());

create policy "groups: admins can update"
  on public.groups for update
  using (public.is_admin());

create policy "groups: admins can delete"
  on public.groups for delete
  using (public.is_admin());

create policy "group_members: authenticated users can read"
  on public.group_members for select
  using (auth.uid() is not null);

create policy "group_members: admins can insert"
  on public.group_members for insert
  with check (public.is_admin());

create policy "group_members: admins can delete"
  on public.group_members for delete
  using (public.is_admin());
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected output: `Applying migration 0010_groups.sql...` with no errors.

- [ ] **Step 3: Verify in Supabase Studio**

Open the Supabase project dashboard → Table Editor. Confirm `groups` and `group_members` appear. Check Authentication → Policies to confirm RLS is enabled on both tables.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0010_groups.sql
git commit -m "feat: add platform groups and group_members tables with RLS"
```

---

## Task 2: db.ts — Groups Functions

**Files:**
- Modify: `src/storage/db.ts`

- [ ] **Step 1: Add Group and GroupMember types + all group functions**

Add the following block after the `// ---- admin: user removal ...` section and before the `// ---- notes & folders` section:

```ts
// ---- groups (platform-level; reusable by any DohDash app) ----

export interface Group {
  id: string;
  name: string;
  description: string | null;
  createdBy: string | null;
  createdAt: number;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
  addedBy: string | null;
  addedAt: number;
}

interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: number;
}

interface GroupMemberRow {
  group_id: string;
  user_id: string;
  added_by: string | null;
  added_at: number;
  member: { display_name: string | null; avatar_url: string | null } | null;
}

function groupRowToGroup(row: GroupRow): Group {
  return { id: row.id, name: row.name, description: row.description, createdBy: row.created_by, createdAt: row.created_at };
}

function groupMemberRowToGroupMember(row: GroupMemberRow): GroupMember {
  return {
    groupId: row.group_id,
    userId: row.user_id,
    displayName: row.member?.display_name ?? null,
    avatarUrl: row.member?.avatar_url ?? null,
    addedBy: row.added_by,
    addedAt: row.added_at,
  };
}

export async function listGroups(): Promise<Group[]> {
  const { data, error } = await supabase.from("groups").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data as GroupRow[]).map(groupRowToGroup);
}

export async function createGroup(name: string, description: string | null, createdBy: string): Promise<Group> {
  const group: Group = { id: crypto.randomUUID(), name, description, createdBy, createdAt: Date.now() };
  const { error } = await supabase.from("groups").insert({
    id: group.id, name: group.name, description: group.description,
    created_by: group.createdBy, created_at: group.createdAt,
  });
  if (error) throw error;
  return group;
}

export async function updateGroup(id: string, name: string, description: string | null): Promise<void> {
  const { error } = await supabase.from("groups").update({ name, description }).eq("id", id);
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await supabase.from("groups").delete().eq("id", id);
  if (error) throw error;
}

export async function listGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, user_id, added_by, added_at, member:profiles!user_id(display_name, avatar_url)")
    .eq("group_id", groupId)
    .order("added_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as GroupMemberRow[]).map(groupMemberRowToGroupMember);
}

export async function addGroupMember(groupId: string, userId: string, addedBy: string): Promise<void> {
  const { error } = await supabase.from("group_members").insert({
    group_id: groupId, user_id: userId, added_by: addedBy, added_at: Date.now(),
  });
  if (error) throw error;
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.from("group_members").delete().eq("group_id", groupId).eq("user_id", userId);
  if (error) throw error;
}

export async function listMyGroups(userId: string): Promise<Group[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("groups(*)")
    .eq("user_id", userId);
  if (error) throw error;
  return ((data ?? []) as unknown as { groups: GroupRow }[]).map((row) => groupRowToGroup(row.groups));
}
```

- [ ] **Step 2: Type check**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/storage/db.ts
git commit -m "feat: add groups CRUD functions to db.ts"
```

---

## Task 3: GroupsPanel Component

**Files:**
- Create: `src/admin/GroupsPanel.tsx`
- Create: `src/admin/GroupsPanel.css`

- [ ] **Step 1: Create `src/admin/GroupsPanel.tsx`**

```tsx
import { useEffect, useRef, useState } from "react";
import {
  listGroups, createGroup, updateGroup, deleteGroup,
  listGroupMembers, addGroupMember, removeGroupMember, listProfiles,
  type Group, type GroupMember, type Profile,
} from "../storage/db";
import { useAuth } from "../auth/AuthContext";
import "./GroupsPanel.css";

export function GroupsPanel() {
  const { state } = useAuth();
  const currentUserId = state.status === "authenticated" ? state.profile.id : null;

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [descValue, setDescValue] = useState("");
  const [creatingName, setCreatingName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  useEffect(() => {
    void (async () => {
      try {
        const [list, profileList] = await Promise.all([listGroups(), listProfiles()]);
        setGroups(list);
        setProfiles(profileList);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) { setMembers([]); return; }
    void listGroupMembers(selectedId).then(setMembers).catch(() => {});
  }, [selectedId]);

  useEffect(() => {
    if (selected) {
      setNameValue(selected.name);
      setDescValue(selected.description ?? "");
      setEditingName(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function handleCreate() {
    const name = creatingName.trim();
    if (!name || !currentUserId) return;
    try {
      const group = await createGroup(name, null, currentUserId);
      setGroups((prev) => [...prev, group].sort((a, b) => a.name.localeCompare(b.name)));
      setSelectedId(group.id);
      setShowCreate(false);
      setCreatingName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSaveName() {
    if (!selected || !nameValue.trim()) return;
    try {
      await updateGroup(selected.id, nameValue.trim(), descValue || null);
      setGroups((prev) =>
        prev.map((g) =>
          g.id === selected.id ? { ...g, name: nameValue.trim(), description: descValue || null } : g
        ).sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingName(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSaveDesc() {
    if (!selected) return;
    try {
      await updateGroup(selected.id, selected.name, descValue || null);
      setGroups((prev) =>
        prev.map((g) => (g.id === selected.id ? { ...g, description: descValue || null } : g))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteGroup(id: string) {
    try {
      await deleteGroup(id);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      if (selectedId === id) setSelectedId(null);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleAddMember(userId: string) {
    if (!selectedId || !currentUserId) return;
    if (members.some((m) => m.userId === userId)) return;
    try {
      await addGroupMember(selectedId, userId, currentUserId);
      setMembers(await listGroupMembers(selectedId));
      setMemberSearch("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedId) return;
    try {
      await removeGroupMember(selectedId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const memberIds = new Set(members.map((m) => m.userId));
  const suggestions = profiles
    .filter(
      (p) =>
        !memberIds.has(p.id) &&
        (p.displayName?.toLowerCase().includes(memberSearch.toLowerCase()) ||
          p.email.toLowerCase().includes(memberSearch.toLowerCase()))
    )
    .slice(0, 5);

  return (
    <div className="groups-panel">
      {error && <p className="groups-error">{error}</p>}
      <div className="groups-left">
        <div className="groups-list-head">
          <span className="groups-list-title">Groups</span>
          <button className="groups-new-btn" onClick={() => setShowCreate(true)}>+ New</button>
        </div>
        {showCreate && (
          <div className="groups-create-row">
            <input
              className="groups-create-input"
              placeholder="Group name…"
              value={creatingName}
              autoFocus
              onChange={(e) => setCreatingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleCreate();
                if (e.key === "Escape") { setShowCreate(false); setCreatingName(""); }
              }}
            />
            <button className="groups-create-confirm" onClick={() => void handleCreate()}>Create</button>
            <button className="groups-create-cancel" onClick={() => { setShowCreate(false); setCreatingName(""); }}>✕</button>
          </div>
        )}
        <ul className="groups-list">
          {groups.length === 0 && !showCreate && (
            <li className="groups-empty">No groups yet</li>
          )}
          {groups.map((g) => (
            <li
              key={g.id}
              className={`groups-list-item${g.id === selectedId ? " active" : ""}`}
              onClick={() => setSelectedId(g.id)}
            >
              <span className="groups-list-name">{g.name}</span>
              <span className="groups-list-count">{g.id === selectedId ? `${members.length}` : ""}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="groups-right">
        {!selected ? (
          <p className="groups-no-selection">Select a group to manage it</p>
        ) : (
          <>
            <div className="groups-detail-head">
              {editingName ? (
                <input
                  ref={nameInputRef}
                  className="groups-name-input"
                  value={nameValue}
                  autoFocus
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleSaveName();
                    if (e.key === "Escape") { setNameValue(selected.name); setEditingName(false); }
                  }}
                  onBlur={() => void handleSaveName()}
                />
              ) : (
                <h2 className="groups-name" onClick={() => setEditingName(true)} title="Click to rename">
                  {selected.name}
                </h2>
              )}
            </div>

            <div className="groups-desc-row">
              <textarea
                className="groups-desc-input"
                placeholder="Add a description…"
                value={descValue}
                rows={2}
                onChange={(e) => setDescValue(e.target.value)}
                onBlur={() => void handleSaveDesc()}
              />
            </div>

            <section className="groups-members-section">
              <h3 className="groups-section-title">Members ({members.length})</h3>
              <ul className="groups-members-list">
                {members.map((m) => (
                  <li key={m.userId} className="groups-member-row">
                    {m.avatarUrl ? (
                      <img className="groups-avatar" src={m.avatarUrl} alt="" />
                    ) : (
                      <span className="groups-avatar groups-avatar--placeholder">
                        {(m.displayName ?? "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="groups-member-name">{m.displayName ?? m.userId}</span>
                    <button
                      className="groups-remove-btn"
                      onClick={() => void handleRemoveMember(m.userId)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>

              <div className="groups-add-member">
                <input
                  className="groups-member-search"
                  placeholder="Add member by name or email…"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                />
                {memberSearch && suggestions.length > 0 && (
                  <ul className="groups-suggestions">
                    {suggestions.map((p) => (
                      <li
                        key={p.id}
                        className="groups-suggestion-item"
                        onMouseDown={(e) => { e.preventDefault(); void handleAddMember(p.id); }}
                      >
                        {p.avatarUrl ? (
                          <img className="groups-avatar groups-avatar--sm" src={p.avatarUrl} alt="" />
                        ) : (
                          <span className="groups-avatar groups-avatar--placeholder groups-avatar--sm">
                            {(p.displayName ?? p.email).slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span>{p.displayName ?? p.email}</span>
                        <span className="groups-suggestion-email">{p.email}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <div className="groups-danger-zone">
              {confirmDeleteId === selected.id ? (
                <div className="groups-confirm-delete">
                  <span>Delete "{selected.name}"?</span>
                  <button className="groups-delete-confirm-btn" onClick={() => void handleDeleteGroup(selected.id)}>
                    Yes, delete
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                </div>
              ) : (
                <button className="groups-delete-btn" onClick={() => setConfirmDeleteId(selected.id)}>
                  Delete group
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/admin/GroupsPanel.css`**

```css
.groups-panel {
  display: flex;
  gap: var(--spacing-lg);
  min-height: 400px;
}

.groups-left {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  padding-right: var(--spacing-lg);
}

.groups-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.groups-list-title {
  font-family: var(--font-heading);
  font-weight: var(--font-weight-heading);
  font-size: 0.8rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.groups-new-btn {
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: var(--rounded-sm);
  padding: 2px 8px;
  font-size: 0.8rem;
  cursor: pointer;
}

.groups-create-row {
  display: flex;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-sm);
}

.groups-create-input {
  flex: 1;
  border: 1px solid var(--border);
  border-radius: var(--rounded-sm);
  padding: 4px 6px;
  font-size: 0.85rem;
  background: var(--bg);
  color: var(--text);
  min-width: 0;
}

.groups-create-confirm {
  background: var(--accent);
  color: var(--bg);
  border: none;
  border-radius: var(--rounded-sm);
  padding: 4px 8px;
  font-size: 0.8rem;
  cursor: pointer;
}

.groups-create-cancel {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--muted);
}

.groups-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.groups-empty {
  color: var(--muted);
  font-size: 0.85rem;
  padding: var(--spacing-sm) 0;
}

.groups-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--rounded-sm);
  cursor: pointer;
  font-size: 0.9rem;
  color: var(--text);
  transition: background 0.1s;
}

.groups-list-item:hover { background: var(--accent-soft); }
.groups-list-item.active {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: var(--font-weight-heading);
}

.groups-list-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.groups-list-count {
  font-size: 0.75rem;
  color: var(--muted);
  flex-shrink: 0;
}

.groups-right { flex: 1; min-width: 0; }

.groups-no-selection {
  color: var(--muted);
  font-size: 0.9rem;
  margin-top: var(--spacing-lg);
}

.groups-detail-head { margin-bottom: var(--spacing-md); }

.groups-name {
  font-family: var(--font-heading);
  font-weight: var(--font-weight-heading);
  font-size: 1.2rem;
  color: var(--text);
  margin: 0;
  cursor: pointer;
}
.groups-name:hover { color: var(--accent); }

.groups-name-input {
  font-family: var(--font-heading);
  font-size: 1.2rem;
  font-weight: var(--font-weight-heading);
  border: 1px solid var(--accent);
  border-radius: var(--rounded-sm);
  padding: 2px 6px;
  background: var(--bg);
  color: var(--text);
  width: 100%;
  box-sizing: border-box;
}

.groups-desc-row { margin-bottom: var(--spacing-lg); }

.groups-desc-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--rounded-sm);
  padding: var(--spacing-sm);
  font-family: var(--font-body);
  font-size: 0.9rem;
  background: var(--bg);
  color: var(--text);
  resize: vertical;
  box-sizing: border-box;
}

.groups-section-title {
  font-family: var(--font-heading);
  font-weight: var(--font-weight-heading);
  font-size: 0.8rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--spacing-sm) 0;
}

.groups-members-list { list-style: none; padding: 0; margin: 0 0 var(--spacing-md) 0; }

.groups-member-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
  border-bottom: 1px solid var(--border);
}

.groups-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.groups-avatar--placeholder {
  background: var(--accent-soft);
  color: var(--accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: var(--font-weight-heading);
}

.groups-avatar--sm { width: 22px; height: 22px; font-size: 0.7rem; }

.groups-member-name {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.groups-remove-btn {
  background: transparent;
  color: var(--error);
  border: none;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 2px 6px;
  border-radius: var(--rounded-sm);
  transition: all 0.15s;
}
.groups-remove-btn:hover { background: var(--error); color: var(--bg); }

.groups-add-member { position: relative; }

.groups-member-search {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--rounded-sm);
  padding: var(--spacing-sm);
  font-size: 0.9rem;
  background: var(--bg);
  color: var(--text);
  box-sizing: border-box;
}
.groups-member-search:focus { outline: none; border-color: var(--accent); }

.groups-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--rounded-sm);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  list-style: none;
  padding: var(--spacing-xs) 0;
  margin: 2px 0 0 0;
  z-index: 10;
}

.groups-suggestion-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  cursor: pointer;
  font-size: 0.9rem;
}
.groups-suggestion-item:hover { background: var(--accent-soft); }

.groups-suggestion-email { color: var(--muted); font-size: 0.8rem; margin-left: auto; }

.groups-danger-zone {
  margin-top: var(--spacing-xl);
  padding-top: var(--spacing-lg);
  border-top: 1px solid var(--border);
}

.groups-delete-btn {
  background: transparent;
  color: var(--error);
  border: 1px solid var(--error);
  border-radius: var(--rounded-md);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.15s;
}
.groups-delete-btn:hover { background: var(--error); color: var(--bg); }

.groups-confirm-delete {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  font-size: 0.9rem;
  color: var(--text);
}

.groups-delete-confirm-btn {
  background: var(--error);
  color: var(--bg);
  border: none;
  border-radius: var(--rounded-sm);
  padding: var(--spacing-sm) var(--spacing-lg);
  cursor: pointer;
}

.groups-error { color: var(--error); font-size: 0.9rem; margin-bottom: var(--spacing-md); }
```

- [ ] **Step 3: Type check**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/admin/GroupsPanel.tsx src/admin/GroupsPanel.css
git commit -m "feat: add GroupsPanel admin component for group management"
```

---

## Task 4: Wire Groups Tab into AdminDashboard

**Files:**
- Modify: `src/admin/AdminDashboard.tsx`

- [ ] **Step 1: Add the Groups import and tab**

At the top of `AdminDashboard.tsx`, add the import after the `ActivityPanel` import:

```ts
import { GroupsPanel } from "./GroupsPanel";
```

Change the `Tab` type (line 25):

```ts
type Tab = "users" | "app-access" | "activity" | "groups";
```

In the `return` JSX, after the Activity tab button (around line 142), add:

```tsx
<button
  className={tab === "groups" ? "admin-tab admin-tab--active" : "admin-tab"}
  onClick={() => setTab("groups")}
>
  Groups
</button>
```

At the bottom of the tab content conditional (after the `<ActivityPanel>` branch, around line 168):

```tsx
) : tab === "activity" ? (
  <ActivityPanel profiles={profiles} />
) : (
  <GroupsPanel />
)}
```

- [ ] **Step 2: Type check and manual verify**

```bash
npm run build
```

Start `npm run dev`. Sign in as admin. Open Admin panel. Confirm the Groups tab appears and renders the GroupsPanel with empty state ("No groups yet").

- [ ] **Step 3: Smoke test group CRUD**

1. Click "Groups" tab → "+ New" → type "Field Crew" → Enter. Confirm group appears in left list and detail pane opens.
2. Click the group name → rename it to "Field Team" → blur. Confirm name updates.
3. Add a description → blur. Confirm description persists (reload page).
4. Add a member via the search field. Confirm member appears in list.
5. Remove the member. Confirm member disappears.
6. Delete the group with confirmation. Confirm it's removed from the list.

- [ ] **Step 4: Commit**

```bash
git add src/admin/AdminDashboard.tsx
git commit -m "feat: add Groups tab to admin dashboard"
```

---

## Task 5: Migration — Share Tables, Permission Function, New RLS

**Files:**
- Create: `supabase/migrations/0011_note_sharing.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Note and folder sharing: per-user ownership with share-based access control.
-- resolve_note_permission() is the single source of truth for all access decisions.

-- ---- Share tables ----

create table public.note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes(id) on delete cascade,
  grantee_type text not null check (grantee_type in ('user', 'group')),
  grantee_id uuid not null,
  permission text not null check (permission in ('edit', 'comment')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at bigint not null,
  unique (note_id, grantee_type, grantee_id)
);

create table public.folder_shares (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.folders(id) on delete cascade,
  grantee_type text not null check (grantee_type in ('user', 'group')),
  grantee_id uuid not null,
  permission text not null check (permission in ('edit', 'comment')),
  granted_by uuid references public.profiles(id) on delete set null,
  created_at bigint not null,
  unique (folder_id, grantee_type, grantee_id)
);

-- ---- Permission resolution function ----
-- Resolution order:
--   1. Owner → 'owner'
--   2. Note-level grants (direct user + group expansion) → most permissive
--   3. Folder-level grants → most permissive
--   Note-level overrides folder-level entirely (in either direction).

create or replace function public.resolve_note_permission(p_note_id uuid, p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  with
  note_info as (
    select owner_id, folder_id from public.notes where id = p_note_id
  ),
  user_groups as (
    select group_id from public.group_members where user_id = p_user_id
  ),
  note_grants as (
    select permission from public.note_shares
    where note_id = p_note_id
      and (
        (grantee_type = 'user'  and grantee_id = p_user_id)
        or (grantee_type = 'group' and grantee_id in (select group_id from user_groups))
      )
  ),
  folder_grants as (
    select fs.permission
    from public.folder_shares fs
    join note_info ni on ni.folder_id = fs.folder_id
    where
      (fs.grantee_type = 'user'  and fs.grantee_id = p_user_id)
      or (fs.grantee_type = 'group' and fs.grantee_id in (select group_id from user_groups))
  )
  select
    case
      when (select owner_id from note_info) = p_user_id
        then 'owner'
      when exists (select 1 from note_grants)
        then case when 'edit' in (select permission from note_grants) then 'edit' else 'comment' end
      when exists (select 1 from folder_grants)
        then case when 'edit' in (select permission from folder_grants) then 'edit' else 'comment' end
      else null
    end
$$;

-- Batch helper: resolves permissions for multiple notes in one round-trip
create or replace function public.get_notes_effective_permissions(p_note_ids uuid[], p_user_id uuid)
returns table(note_id uuid, effective_permission text)
language sql
security definer
set search_path = public
stable
as $$
  select n as note_id, public.resolve_note_permission(n, p_user_id)
  from unnest(p_note_ids) as n
$$;

-- ---- Backfill null owner_ids ----
-- Existing notes/folders with no owner are assigned to the earliest admin.

update public.notes
set owner_id = (select id from public.profiles where role = 'admin' order by created_at limit 1)
where owner_id is null;

update public.folders
set owner_id = (select id from public.profiles where role = 'admin' order by created_at limit 1)
where owner_id is null;

-- ---- Replace notes RLS ----

drop policy if exists "notes: tasks app members manage all" on public.notes;

create policy "notes: owner or shared can select"
  on public.notes for select
  using (public.resolve_note_permission(id, auth.uid()) is not null);

create policy "notes: app members can insert own notes"
  on public.notes for insert
  with check (public.has_app_access('tasks') and auth.uid() = owner_id);

create policy "notes: owner or editor can update"
  on public.notes for update
  using (public.resolve_note_permission(id, auth.uid()) in ('owner', 'edit'));

create policy "notes: owner can delete"
  on public.notes for delete
  using (auth.uid() = owner_id);

-- ---- Replace folders RLS ----

drop policy if exists "folders: tasks app members manage all" on public.folders;

create policy "folders: owner or shared can select"
  on public.folders for select
  using (
    auth.uid() = owner_id
    or exists (
      select 1 from public.folder_shares fs
      where fs.folder_id = id
        and (
          (fs.grantee_type = 'user' and fs.grantee_id = auth.uid())
          or (fs.grantee_type = 'group' and fs.grantee_id in (
            select gm.group_id from public.group_members gm where gm.user_id = auth.uid()
          ))
        )
    )
  );

create policy "folders: app members can insert own folders"
  on public.folders for insert
  with check (public.has_app_access('tasks') and auth.uid() = owner_id);

create policy "folders: owner can update"
  on public.folders for update
  using (auth.uid() = owner_id);

create policy "folders: owner can delete"
  on public.folders for delete
  using (auth.uid() = owner_id);

-- ---- note_shares RLS ----

alter table public.note_shares enable row level security;

create policy "note_shares: note owner or grantee can select"
  on public.note_shares for select
  using (
    exists (select 1 from public.notes where id = note_id and owner_id = auth.uid())
    or (grantee_type = 'user' and grantee_id = auth.uid())
    or (grantee_type = 'group' and grantee_id in (
      select group_id from public.group_members where user_id = auth.uid()
    ))
  );

create policy "note_shares: note owner can insert"
  on public.note_shares for insert
  with check (exists (select 1 from public.notes where id = note_id and owner_id = auth.uid()));

create policy "note_shares: note owner can update"
  on public.note_shares for update
  using (exists (select 1 from public.notes where id = note_id and owner_id = auth.uid()));

create policy "note_shares: note owner can delete"
  on public.note_shares for delete
  using (exists (select 1 from public.notes where id = note_id and owner_id = auth.uid()));

-- ---- folder_shares RLS ----

alter table public.folder_shares enable row level security;

create policy "folder_shares: folder owner or grantee can select"
  on public.folder_shares for select
  using (
    exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid())
    or (grantee_type = 'user' and grantee_id = auth.uid())
    or (grantee_type = 'group' and grantee_id in (
      select group_id from public.group_members where user_id = auth.uid()
    ))
  );

create policy "folder_shares: folder owner can insert"
  on public.folder_shares for insert
  with check (exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid()));

create policy "folder_shares: folder owner can update"
  on public.folder_shares for update
  using (exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid()));

create policy "folder_shares: folder owner can delete"
  on public.folder_shares for delete
  using (exists (select 1 from public.folders where id = folder_id and owner_id = auth.uid()));
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected: Migration applies cleanly. Existing notes remain visible to their owners in DohDocs.

- [ ] **Step 3: Verify permission function**

In Supabase Studio SQL Editor, run (replace UUIDs with real ones from your data):

```sql
-- Should return 'owner' for the note's own owner_id
select public.resolve_note_permission('<note_id>', '<owner_user_id>');

-- Should return null for a user with no access
select public.resolve_note_permission('<note_id>', '<other_user_id>');
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_note_sharing.sql
git commit -m "feat: add note sharing tables, resolve_note_permission function, and new RLS"
```

---

## Task 6: db.ts — Share Types, Functions, DocMeta/Folder Updates, listDocs

**Files:**
- Modify: `src/storage/db.ts`

- [ ] **Step 1: Extend DocMeta with sharing fields**

Replace the existing `DocMeta` interface:

```ts
export interface DocMeta {
  id: string;
  title: string;
  updatedAt: number;
  folderId: string | null;
  ownerId: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  effectivePermission?: 'owner' | 'edit' | 'comment' | null;
}
```

- [ ] **Step 2: Extend Folder with ownerId**

Replace the existing `Folder` interface:

```ts
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  ownerId: string | null;
}
```

Update `folderRowToFolder` to include it:

```ts
function folderRowToFolder(row: FolderRow): Folder {
  return { id: row.id, name: row.name, parentId: row.parent_id, createdAt: row.created_at, ownerId: row.owner_id ?? null };
}
```

- [ ] **Step 3: Update NoteRow and noteRowToMeta for owner join**

Update `NoteRow` to accept the optional owner join:

```ts
interface NoteRow {
  id: string;
  title: string;
  markdown: string;
  updated_at: number;
  folder_id: string | null;
  owner_id: string | null;
  owner?: { display_name: string | null; avatar_url: string | null } | null;
}
```

Update `noteRowToMeta`:

```ts
function noteRowToMeta(row: NoteRow): DocMeta {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
    folderId: row.folder_id,
    ownerId: row.owner_id,
    ownerName: row.owner?.display_name ?? null,
    ownerAvatarUrl: row.owner?.avatar_url ?? null,
  };
}
```

- [ ] **Step 4: Replace listDocs with view-aware version**

Replace the existing `listDocs` function:

```ts
export async function listDocs(
  query = "",
  view: 'mine' | 'shared' | 'all' = 'all',
  userId?: string
): Promise<DocMeta[]> {
  const q = query.trim();
  let req = supabase
    .from("notes")
    .select("id, title, updated_at, folder_id, owner_id, owner:profiles!owner_id(display_name, avatar_url)")
    .order("updated_at", { ascending: false });

  if (q) req = req.or(`title.ilike.%${q}%,markdown.ilike.%${q}%`);
  if (view === 'mine' && userId) req = req.eq('owner_id', userId);
  else if (view === 'shared' && userId) req = req.neq('owner_id', userId);

  const { data, error } = await req;
  if (error) throw error;

  const metas = (data as NoteRow[]).map(noteRowToMeta);

  if (userId && (view === 'shared' || view === 'all')) {
    const sharedIds = metas.filter((m) => m.ownerId !== userId).map((m) => m.id);
    if (sharedIds.length > 0) {
      const { data: perms } = await supabase.rpc('get_notes_effective_permissions', {
        p_note_ids: sharedIds,
        p_user_id: userId,
      });
      if (perms) {
        const permMap = new Map(
          (perms as { note_id: string; effective_permission: string }[]).map((p) => [
            p.note_id,
            p.effective_permission as 'owner' | 'edit' | 'comment',
          ])
        );
        return metas.map((m) => ({
          ...m,
          effectivePermission: m.ownerId === userId ? 'owner' : (permMap.get(m.id) ?? null),
        }));
      }
    }
  }

  return metas.map((m) => ({ ...m, effectivePermission: m.ownerId === userId ? 'owner' : null }));
}
```

- [ ] **Step 5: Add share types and CRUD functions**

Add after the `listDocs` function (before `uploadImage`):

```ts
// ---- note & folder shares ----

export type Permission = 'edit' | 'comment';
export type GranteeType = 'user' | 'group';

export interface NoteShare {
  id: string;
  noteId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: Permission;
  grantedBy: string | null;
  createdAt: number;
}

export interface FolderShare {
  id: string;
  folderId: string;
  granteeType: GranteeType;
  granteeId: string;
  permission: Permission;
  grantedBy: string | null;
  createdAt: number;
}

export interface ShareTarget {
  id: string;
  type: GranteeType;
  name: string | null;
  avatarUrl: string | null;
}

interface ShareRow {
  id: string;
  note_id?: string;
  folder_id?: string;
  grantee_type: string;
  grantee_id: string;
  permission: string;
  granted_by: string | null;
  created_at: number;
}

export async function listNoteShares(noteId: string): Promise<NoteShare[]> {
  const { data, error } = await supabase
    .from('note_shares')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ShareRow[]).map((row) => ({
    id: row.id,
    noteId: row.note_id!,
    granteeType: row.grantee_type as GranteeType,
    granteeId: row.grantee_id,
    permission: row.permission as Permission,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  }));
}

export async function addNoteShare(
  noteId: string, granteeType: GranteeType, granteeId: string,
  permission: Permission, grantedBy: string
): Promise<void> {
  const { error } = await supabase.from('note_shares').insert({
    id: crypto.randomUUID(), note_id: noteId, grantee_type: granteeType,
    grantee_id: granteeId, permission, granted_by: grantedBy, created_at: Date.now(),
  });
  if (error) throw error;
}

export async function updateNoteShare(id: string, permission: Permission): Promise<void> {
  const { error } = await supabase.from('note_shares').update({ permission }).eq('id', id);
  if (error) throw error;
}

export async function removeNoteShare(id: string): Promise<void> {
  const { error } = await supabase.from('note_shares').delete().eq('id', id);
  if (error) throw error;
}

export async function listFolderShares(folderId: string): Promise<FolderShare[]> {
  const { data, error } = await supabase
    .from('folder_shares')
    .select('*')
    .eq('folder_id', folderId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as ShareRow[]).map((row) => ({
    id: row.id,
    folderId: row.folder_id!,
    granteeType: row.grantee_type as GranteeType,
    granteeId: row.grantee_id,
    permission: row.permission as Permission,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  }));
}

export async function addFolderShare(
  folderId: string, granteeType: GranteeType, granteeId: string,
  permission: Permission, grantedBy: string
): Promise<void> {
  const { error } = await supabase.from('folder_shares').insert({
    id: crypto.randomUUID(), folder_id: folderId, grantee_type: granteeType,
    grantee_id: granteeId, permission, granted_by: grantedBy, created_at: Date.now(),
  });
  if (error) throw error;
}

export async function updateFolderShare(id: string, permission: Permission): Promise<void> {
  const { error } = await supabase.from('folder_shares').update({ permission }).eq('id', id);
  if (error) throw error;
}

export async function removeFolderShare(id: string): Promise<void> {
  const { error } = await supabase.from('folder_shares').delete().eq('id', id);
  if (error) throw error;
}

/** Full-text search across profiles and groups; used by share target type-ahead. */
export async function searchShareTargets(query: string): Promise<ShareTarget[]> {
  const q = query.trim();
  if (!q) return [];
  const [{ data: users }, { data: groups }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, email, avatar_url')
      .or(`display_name.ilike.%${q}%,email.ilike.%${q}%`)
      .limit(5),
    supabase.from('groups').select('id, name').ilike('name', `%${q}%`).limit(5),
  ]);
  return [
    ...((users ?? []) as { id: string; display_name: string | null; email: string; avatar_url: string | null }[]).map(
      (u) => ({ id: u.id, type: 'user' as const, name: u.display_name ?? u.email, avatarUrl: u.avatar_url })
    ),
    ...((groups ?? []) as { id: string; name: string }[]).map(
      (g) => ({ id: g.id, type: 'group' as const, name: g.name, avatarUrl: null })
    ),
  ];
}

/** Returns folder_shares visible to the current user (RLS-filtered). */
export async function listAllVisibleFolderShares(): Promise<FolderShare[]> {
  const { data, error } = await supabase.from('folder_shares').select('*');
  if (error) throw error;
  return ((data ?? []) as ShareRow[]).map((row) => ({
    id: row.id,
    folderId: row.folder_id!,
    granteeType: row.grantee_type as GranteeType,
    granteeId: row.grantee_id,
    permission: row.permission as Permission,
    grantedBy: row.granted_by,
    createdAt: row.created_at,
  }));
}
```

- [ ] **Step 6: Type check**

```bash
npm run build
```

Expected: No errors. The `Folder.ownerId` addition may surface TypeScript errors in existing Sidebar or TasksApp code that destructure `Folder` — fix any that appear (they'll only need `ownerId` added to mappings, no logic changes).

- [ ] **Step 7: Commit**

```bash
git add src/storage/db.ts
git commit -m "feat: add share types/functions, extend DocMeta and Folder, update listDocs"
```

---

## Task 7: Sidebar View Toggle + TasksApp View State

**Files:**
- Modify: `src/apps/tasks/TasksApp.tsx`
- Modify: `src/apps/tasks/components/Sidebar.tsx`

- [ ] **Step 1: Add view state and localStorage key to TasksApp**

Add `view` state and its type at the top of `TasksApp` (after the `sort` state line ~103):

```ts
export type ViewMode = 'mine' | 'shared' | 'all';

// inside TasksApp:
const [view, setView] = useState<ViewMode>(
  () => (localStorage.getItem('dohdash-tasks-view') as ViewMode) || 'mine'
);
```

After the existing `localStorage.setItem('dohdash-tasks-sort', sort)` effect (~line 171), add:

```ts
useEffect(() => {
  localStorage.setItem('dohdash-tasks-view', view);
}, [view]);
```

- [ ] **Step 2: Update listDocs call in TasksApp to pass view + userId**

Replace the `loadDocs` callback (~line 116):

```ts
const loadDocs = useCallback(async (q = search) => {
  const seq = ++loadSeq.current;
  const list = await listDocs(q, view, ownerId ?? undefined);
  if (seq === loadSeq.current) setDocs(list);
}, [search, view, ownerId]);
```

- [ ] **Step 3: Merge effectivePermission onto active doc when selecting**

Replace `handleSelect`:

```ts
async function handleSelect(id: string) {
  const meta = docs.find((d) => d.id === id);
  const doc = await getDoc(id);
  if (doc) setActive({ ...doc, effectivePermission: meta?.effectivePermission ?? 'owner' });
  else setActive(null);
  setRemoteDeleted(false);
  setSidebarOpen(false);
}
```

Replace `handleCreateInFolder` (set effectivePermission on new docs):

```ts
async function handleCreateInFolder(folderId: string | null) {
  const doc = await createDoc(folderId, ownerId);
  setActive({ ...doc, effectivePermission: 'owner' });
  setRemoteDeleted(false);
  await loadDocs();
  notifyDocsListChanged();
}
```

- [ ] **Step 4: Add view prop to Sidebar Props interface**

In `Sidebar.tsx`, add to the `Props` interface (after `onBulkDelete`):

```ts
view: ViewMode;
onViewChange: (v: ViewMode) => void;
```

Add the import at the top of `Sidebar.tsx`:

```ts
import type { DocMeta, Folder } from "../../../storage/db";
import type { ViewMode } from "../TasksApp";
```

- [ ] **Step 5: Render the Mine | Shared | All toggle in Sidebar**

In the `Sidebar` function, destructure the new props:

```ts
export function Sidebar({
  docs, folders, activeId, search, onSearch, sort, onSort,
  onSelect, onCreateInFolder, onDelete, onMoveDoc,
  onCreateFolder, onRenameFolder, onDeleteFolder,
  isOpen, onClose,
  selectMode, selectedIds, onToggleSelectMode, onToggleSelect, onBulkDelete,
  view, onViewChange,
}: Props) {
```

In the `.sidebar-controls` div (after the `<input>` and before the sort `<label>`), add the toggle:

```tsx
<div className="view-toggle">
  {(['mine', 'shared', 'all'] as ViewMode[]).map((v) => (
    <button
      key={v}
      className={`view-toggle-btn${view === v ? ' active' : ''}`}
      onClick={() => onViewChange(v)}
    >
      {v === 'mine' ? 'Mine' : v === 'shared' ? 'Shared' : 'All'}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Pass view props from TasksApp to Sidebar**

In `TasksApp.tsx`, add `view` and `onViewChange` to the `<Sidebar>` JSX:

```tsx
<Sidebar
  {/* ...existing props... */}
  view={view}
  onViewChange={setView}
/>
```

- [ ] **Step 7: Add view toggle CSS to Sidebar.css**

In `src/apps/tasks/components/Sidebar.css`, add:

```css
.view-toggle {
  display: flex;
  gap: 2px;
  margin-bottom: var(--spacing-sm);
  background: var(--bg-alt);
  border-radius: var(--rounded-sm);
  padding: 2px;
}

.view-toggle-btn {
  flex: 1;
  border: none;
  background: transparent;
  border-radius: var(--rounded-sm);
  padding: 4px 0;
  font-size: 0.8rem;
  color: var(--muted);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.view-toggle-btn.active {
  background: var(--bg);
  color: var(--text);
  font-weight: var(--font-weight-heading);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
```

- [ ] **Step 8: Type check**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 9: Manual verify**

Start `npm run dev`. Open DohDocs. Confirm the Mine / Shared / All segmented control appears above the search bar. Toggling modes persists across page reload. "Mine" shows only owned docs. "All" shows both (if any shared docs exist). "Shared" shows nothing until shares are created.

- [ ] **Step 10: Commit**

```bash
git add src/apps/tasks/TasksApp.tsx src/apps/tasks/components/Sidebar.tsx src/apps/tasks/components/Sidebar.css
git commit -m "feat: add Mine/Shared/All view toggle to DohDocs sidebar"
```

---

## Task 8: Sidebar — Shared View Display and Share Indicators

**Files:**
- Modify: `src/apps/tasks/components/Sidebar.tsx`
- Modify: `src/apps/tasks/TasksApp.tsx`

- [ ] **Step 1: Add sharedFolderIds prop to Sidebar and load it in TasksApp**

In `Sidebar.tsx` Props interface, add:

```ts
sharedFolderIds: Set<string>;
currentUserId: string | null;
```

In `TasksApp.tsx`, add state and load it after the existing `listFolders` call:

```ts
const [sharedFolderIds, setSharedFolderIds] = useState<Set<string>>(new Set());
```

In the initialization effect (inside the `Promise.all` block, after setting folders), add:

```ts
import { listAllVisibleFolderShares } from "../../storage/db";

// inside the init effect, after setFolders:
const folderShares = await listAllVisibleFolderShares();
const ownedFolderIds = new Set(folderList.map((f) => f.id));
setSharedFolderIds(new Set(folderShares.filter((s) => ownedFolderIds.has(s.folderId)).map((s) => s.folderId)));
```

Pass to Sidebar:

```tsx
<Sidebar
  {/* ...existing props... */}
  sharedFolderIds={sharedFolderIds}
  currentUserId={ownerId}
/>
```

- [ ] **Step 2: Add share icon to DocItem for shared-by-me notes**

In the `DocItem` component, after `<span className="doc-title">`, add:

```tsx
{doc.effectivePermission === 'owner' && doc.ownerName === null
  ? null  // no indicator
  : doc.effectivePermission === 'owner'
  ? null  // owned doc, no indicator needed in 'mine' view
  : doc.ownerAvatarUrl
  ? <img className="doc-owner-avatar" src={doc.ownerAvatarUrl} alt={doc.ownerName ?? ''} title={`Shared by ${doc.ownerName ?? 'someone'}`} />
  : <span className="doc-owner-initial" title={`Shared by ${doc.ownerName ?? 'someone'}`}>{(doc.ownerName ?? '?').slice(0, 1).toUpperCase()}</span>
}
```

And for the "shared with others by me" indicator (share icon on docs I own that are shared):

```tsx
{/* inside DocItem, after the title, before doc-actions */}
```

Actually, simpler: In `FolderNode`, after `{folder.name}` span, show the share icon if folder is in `sharedFolderIds`. Pass `sharedFolderIds` down to `FolderNode`.

Add `sharedFolderIds: Set<string>` to `FolderNodeProps`:

```ts
interface FolderNodeProps {
  // ...existing...
  sharedFolderIds: Set<string>;
}
```

In the `FolderNode` folder-name span:

```tsx
<span className="folder-name">
  {/* existing folder SVG icon */}
  {folder.name}
  {sharedFolderIds.has(folder.id) && (
    <svg className="folder-shared-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" title="Shared">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  )}
</span>
```

Pass `sharedFolderIds` through `FolderNode` → children `FolderNode`s and `Sidebar`.

- [ ] **Step 3: Render shared view as owner-grouped flat list**

In the `Sidebar` function body, before the `return`, add:

```ts
const sharedDocs = docs.filter((d) => d.effectivePermission !== 'owner');
const ownedDocs = docs.filter((d) => d.effectivePermission === 'owner');

// For 'shared' view: group by ownerId
const sharedByOwner = new Map<string, { name: string | null; avatar: string | null; docs: DocMeta[] }>();
for (const doc of sharedDocs) {
  const key = doc.ownerId ?? 'unknown';
  if (!sharedByOwner.has(key)) {
    sharedByOwner.set(key, { name: doc.ownerName, avatar: doc.ownerAvatarUrl, docs: [] });
  }
  sharedByOwner.get(key)!.docs.push(doc);
}
```

Replace the main `<ul className="doc-list">` block with a conditional based on `view`:

```tsx
<ul className="doc-list">
  {view === 'shared' ? (
    sharedDocs.length === 0
      ? <li className="empty">{search ? "No matches" : "Nothing shared with you yet"}</li>
      : Array.from(sharedByOwner.entries()).map(([ownerId, group]) => (
          <li key={ownerId} className="shared-owner-group">
            <div className="shared-owner-header">
              {group.avatar
                ? <img className="shared-owner-avatar" src={group.avatar} alt="" />
                : <span className="shared-owner-avatar shared-owner-avatar--placeholder">{(group.name ?? '?').slice(0, 1).toUpperCase()}</span>
              }
              <span className="shared-owner-name">{group.name ?? 'Unknown'}</span>
            </div>
            <ul className="shared-docs-list">
              {group.docs.map((doc) => (
                <li key={doc.id}
                  className={`doc-item${doc.id === activeId ? ' active' : ''}`}
                  style={{ paddingLeft: '26px' }}
                  onClick={() => onSelect(doc.id)}
                >
                  <span className="doc-title">{doc.title || 'Untitled'}</span>
                  <span className={`doc-perm-badge doc-perm-badge--${doc.effectivePermission}`}>
                    {doc.effectivePermission === 'edit' ? 'Edit' : 'Comment'}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))
  ) : (
    <>
      {/* existing mine/all tree rendering */}
      {addingRoot && ( /* ...existing... */ )}
      {(view === 'mine' ? ownedDocs : docs).length === 0 && folders.filter(f => view === 'mine' ? f.ownerId === currentUserId : true).length === 0 && !addingRoot && (
        <li className="empty">{search ? "No matches" : "No documents yet"}</li>
      )}
      {(view === 'mine' ? folders.filter(f => f.ownerId === currentUserId) : folders.filter(f => f.ownerId === currentUserId)).filter(f => f.parentId === null).map((f) => (
        <FolderNode key={f.id} folder={f} depth={0} tree={tree}
          docs={view === 'mine' ? ownedDocs : ownedDocs}
          {/* ...all existing FolderNode props... */}
          sharedFolderIds={sharedFolderIds}
        />
      ))}
      {(view === 'mine' ? ownedDocs : ownedDocs).filter(d => d.folderId === null).map((doc) => (
        <DocItem key={doc.id} doc={doc} activeId={activeId} depth={0} folders={folders}
          onSelect={onSelect} onDelete={onDelete} onMoveDoc={onMoveDoc}
          selectMode={selectMode} selected={selectedIds.has(doc.id)} onToggleSelect={onToggleSelect}
        />
      ))}
      {view === 'all' && sharedDocs.length > 0 && (
        <>
          <li className="shared-section-divider">Shared with me</li>
          {Array.from(sharedByOwner.entries()).map(([ownerId, group]) =>
            group.docs.map((doc) => (
              <li key={doc.id} className={`doc-item${doc.id === activeId ? ' active' : ''}`}
                style={{ paddingLeft: '10px' }}
                onClick={() => onSelect(doc.id)}
              >
                {group.avatar
                  ? <img className="doc-owner-avatar" src={group.avatar} alt="" title={`Shared by ${group.name}`} />
                  : <span className="doc-owner-initial" title={`Shared by ${group.name}`}>{(group.name ?? '?').slice(0, 1).toUpperCase()}</span>
                }
                <span className="doc-title">{doc.title || 'Untitled'}</span>
                <span className={`doc-perm-badge doc-perm-badge--${doc.effectivePermission}`}>
                  {doc.effectivePermission === 'edit' ? 'Edit' : 'Comment'}
                </span>
              </li>
            ))
          )}
        </>
      )}
    </>
  )}
</ul>
```

- [ ] **Step 4: Add CSS for shared view elements**

In `Sidebar.css`, add:

```css
.shared-owner-group { list-style: none; margin-bottom: var(--spacing-md); }

.shared-owner-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: var(--font-weight-heading);
}

.shared-owner-avatar {
  width: 20px; height: 20px; border-radius: 50%; object-fit: cover;
}
.shared-owner-avatar--placeholder {
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: var(--font-weight-heading);
}

.shared-docs-list { list-style: none; padding: 0; margin: 0; }

.shared-section-divider {
  font-size: 0.75rem;
  color: var(--muted);
  font-weight: var(--font-weight-heading);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: var(--spacing-sm) var(--spacing-md) var(--spacing-xs);
  border-top: 1px solid var(--border);
  margin-top: var(--spacing-sm);
  list-style: none;
}

.doc-owner-avatar { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.doc-owner-initial {
  width: 16px; height: 16px; border-radius: 50%; background: var(--accent-soft);
  color: var(--accent); font-size: 0.65rem; display: inline-flex;
  align-items: center; justify-content: center; flex-shrink: 0;
}

.doc-perm-badge {
  font-size: 0.7rem; border-radius: var(--rounded-sm);
  padding: 1px 5px; flex-shrink: 0;
}
.doc-perm-badge--edit { background: var(--accent-soft); color: var(--accent); }
.doc-perm-badge--comment { background: var(--bg-alt); color: var(--muted); }

.folder-shared-icon { margin-left: 4px; opacity: 0.5; vertical-align: middle; }
```

- [ ] **Step 5: Type check**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/apps/tasks/TasksApp.tsx src/apps/tasks/components/Sidebar.tsx src/apps/tasks/components/Sidebar.css
git commit -m "feat: add shared view display, owner badges, and share indicators to sidebar"
```

---

## Task 9: SharePanel Component

**Files:**
- Create: `src/apps/tasks/components/SharePanel.tsx`
- Create: `src/apps/tasks/components/SharePanel.css`

- [ ] **Step 1: Create `src/apps/tasks/components/SharePanel.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listNoteShares, addNoteShare, updateNoteShare, removeNoteShare,
  searchShareTargets, listProfiles, listGroups,
  type NoteShare, type Permission, type ShareTarget,
} from "../../../storage/db";
import "./SharePanel.css";

interface Props {
  noteId: string;
  ownerName: string | null;
  currentUserId: string;
  onClose: () => void;
}

export function SharePanel({ noteId, ownerName, currentUserId, onClose }: Props) {
  const [shares, setShares] = useState<NoteShare[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShareTarget[]>([]);
  const [pendingPermission, setPendingPermission] = useState<Permission>('edit');
  const [error, setError] = useState<string | null>(null);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      const [noteShares, profiles, groups] = await Promise.all([
        listNoteShares(noteId),
        listProfiles(),
        listGroups(),
      ]);
      setShares(noteShares);
      const map = new Map<string, string>();
      profiles.forEach((p) => map.set(p.id, p.displayName ?? p.email));
      groups.forEach((g) => map.set(g.id, g.name));
      setNameMap(map);
    })().catch(() => {});
  }, [noteId]);

  const doSearch = useCallback((q: string) => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!q.trim()) { setResults([]); return; }
    searchRef.current = setTimeout(() => {
      void searchShareTargets(q).then(setResults).catch(() => setResults([]));
    }, 200);
  }, []);

  useEffect(() => { doSearch(query); }, [query, doSearch]);

  async function handleAdd(target: ShareTarget) {
    try {
      await addNoteShare(noteId, target.type, target.id, pendingPermission, currentUserId);
      setShares(await listNoteShares(noteId));
      setQuery("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUpdatePermission(shareId: string, permission: Permission) {
    try {
      await updateNoteShare(shareId, permission);
      setShares((prev) => prev.map((s) => (s.id === shareId ? { ...s, permission } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemove(shareId: string) {
    try {
      await removeNoteShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="share-panel" ref={panelRef}>
      <div className="share-panel-head">
        <h3 className="share-panel-title">Share note</h3>
        <button className="share-panel-close" onClick={onClose}>✕</button>
      </div>

      {error && <p className="share-panel-error">{error}</p>}

      <div className="share-panel-owner-row">
        <span className="share-panel-owner-label">Owner</span>
        <span className="share-panel-owner-name">{ownerName ?? "You"}</span>
      </div>

      {shares.length > 0 && (
        <ul className="share-list">
          {shares.map((s) => (
            <li key={s.id} className="share-row">
              <span className="share-grantee-type-badge">{s.granteeType === 'group' ? 'Group' : 'User'}</span>
              <span className="share-grantee-id">{nameMap.get(s.granteeId) ?? s.granteeId.slice(0, 8) + '…'}</span>
              <select
                className="share-perm-select"
                value={s.permission}
                onChange={(e) => void handleUpdatePermission(s.id, e.target.value as Permission)}
              >
                <option value="edit">Full Edit</option>
                <option value="comment">Comment Only</option>
              </select>
              <button className="share-remove-btn" onClick={() => void handleRemove(s.id)}>✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="share-add-section">
        <div className="share-perm-row">
          <label className="share-perm-label">Permission for new share:</label>
          <select
            className="share-perm-select"
            value={pendingPermission}
            onChange={(e) => setPendingPermission(e.target.value as Permission)}
          >
            <option value="edit">Full Edit</option>
            <option value="comment">Comment Only</option>
          </select>
        </div>
        <div className="share-search-wrap">
          <input
            className="share-search-input"
            placeholder="Search users or groups…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <ul className="share-results">
              {results.map((r) => (
                <li
                  key={r.id}
                  className="share-result-item"
                  onMouseDown={(e) => { e.preventDefault(); void handleAdd(r); }}
                >
                  {r.avatarUrl
                    ? <img className="share-avatar" src={r.avatarUrl} alt="" />
                    : <span className="share-avatar share-avatar--placeholder">{(r.name ?? '?').slice(0, 1).toUpperCase()}</span>
                  }
                  <span className="share-result-name">{r.name}</span>
                  <span className="share-result-type">{r.type === 'group' ? 'Group' : 'User'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/apps/tasks/components/SharePanel.css`**

```css
.share-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 300px;
  height: 100%;
  background: var(--bg);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 20;
  box-shadow: -4px 0 16px rgba(0,0,0,0.08);
  animation: slideInLeft 0.2s ease;
}

.share-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border);
}

.share-panel-title {
  font-family: var(--font-heading);
  font-weight: var(--font-weight-heading);
  font-size: 1rem;
  margin: 0;
  color: var(--text);
}

.share-panel-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--muted);
  font-size: 1rem;
  padding: 4px;
}

.share-panel-error {
  color: var(--error);
  font-size: 0.85rem;
  padding: 0 var(--spacing-lg);
}

.share-panel-owner-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border);
}

.share-panel-owner-label {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.share-panel-owner-name {
  font-size: 0.9rem;
  color: var(--text);
  font-weight: var(--font-weight-heading);
}

.share-list {
  list-style: none;
  padding: var(--spacing-sm) var(--spacing-lg);
  margin: 0;
  border-bottom: 1px solid var(--border);
}

.share-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) 0;
}

.share-grantee-type-badge {
  font-size: 0.7rem;
  background: var(--bg-alt);
  border-radius: var(--rounded-sm);
  padding: 1px 5px;
  color: var(--muted);
  flex-shrink: 0;
}

.share-grantee-id {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.share-perm-select {
  border: 1px solid var(--border);
  border-radius: var(--rounded-sm);
  background: var(--bg);
  color: var(--text);
  font-size: 0.8rem;
  padding: 2px 4px;
}

.share-remove-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--muted);
  font-size: 0.85rem;
  padding: 2px 4px;
  transition: color 0.15s;
}
.share-remove-btn:hover { color: var(--error); }

.share-add-section { padding: var(--spacing-lg); display: flex; flex-direction: column; gap: var(--spacing-md); }

.share-perm-row { display: flex; align-items: center; gap: var(--spacing-sm); }

.share-perm-label { font-size: 0.8rem; color: var(--muted); flex-shrink: 0; }

.share-search-wrap { position: relative; }

.share-search-input {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--rounded-sm);
  padding: var(--spacing-sm);
  font-size: 0.9rem;
  background: var(--bg);
  color: var(--text);
  box-sizing: border-box;
}
.share-search-input:focus { outline: none; border-color: var(--accent); }

.share-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--rounded-sm);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  list-style: none;
  padding: var(--spacing-xs) 0;
  margin: 2px 0 0 0;
  z-index: 10;
}

.share-result-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md);
  cursor: pointer;
  font-size: 0.9rem;
}
.share-result-item:hover { background: var(--accent-soft); }

.share-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.share-avatar--placeholder {
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: var(--font-weight-heading);
}

.share-result-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.share-result-type { font-size: 0.75rem; color: var(--muted); }
```

- [ ] **Step 3: Type check**

```bash
npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/apps/tasks/components/SharePanel.tsx src/apps/tasks/components/SharePanel.css
git commit -m "feat: add SharePanel component for note share management"
```

---

## Task 10: Editor — Share Button, SharePanel, Comment-Only Mode

**Files:**
- Modify: `src/apps/tasks/components/Toolbar.tsx`
- Modify: `src/apps/tasks/components/Editor.tsx`

- [ ] **Step 1: Add onShareOpen prop to Toolbar**

In `Toolbar.tsx`, update the `Props` interface:

```ts
interface Props {
  editor: Editor | null;
  onAddComment?: () => void;
  onShareOpen?: () => void;
  isReadOnly?: boolean;
}
```

Update the `Toolbar` function signature:

```ts
export function Toolbar({ editor, onAddComment, onShareOpen, isReadOnly }: Props) {
```

Add the share button at the end of the toolbar JSX (after the last button, before the closing tag). Also wrap formatting buttons in a conditional to hide them in read-only mode. Find the return statement and add before the closing `</div>` or wherever the toolbar buttons end:

```tsx
{onShareOpen && (
  <button
    className="toolbar-btn"
    title="Share note"
    onClick={onShareOpen}
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
    </svg>
  </button>
)}
```

- [ ] **Step 2: Add SharePanel state and comment-only logic to Editor**

In `Editor.tsx`, add the import:

```ts
import { SharePanel } from "./SharePanel";
```

Add state for the share panel (after `panelOpen` state):

```ts
const [sharePanelOpen, setSharePanelOpen] = useState(false);
```

Derive the effective permission and whether the current user is the owner:

```ts
const isOwner = note.ownerId === self?.id;
const isCommentOnly = note.effectivePermission === 'comment';
```

After the `useEditor` hook, add an effect to enforce read-only mode when permission is 'comment':

```ts
useEffect(() => {
  if (!editor) return;
  editor.setEditable(!isCommentOnly);
}, [editor, isCommentOnly]);
```

- [ ] **Step 3: Pass new props to Toolbar in Editor JSX**

Find the existing `<Toolbar>` line in `Editor.tsx` (currently line 399: `<Toolbar editor={editor} onAddComment={handleAddComment} />`). Replace it with:

```tsx
<Toolbar
  editor={editor}
  onAddComment={handleAddComment}
  onShareOpen={isOwner ? (() => setSharePanelOpen(true)) : undefined}
  isReadOnly={isCommentOnly}
/>
```

`handleAddComment` is the existing function — keep it unchanged. Comment-only users can still add comments; only formatting controls are hidden via the `isReadOnly` prop.

In `Toolbar.tsx`, wrap all formatting-only buttons (heading selector, list controls, bold/italic, the F format ribbon, archive, image upload) with `{!isReadOnly && (...)}`. The `onAddComment` button and `onShareOpen` button remain always visible.

- [ ] **Step 4: Add comment-only banner and render SharePanel**

In `Editor.tsx` JSX, add the banner before `<EditorContent>` (or at the top of the editor area):

```tsx
{isCommentOnly && (
  <div className="editor-readonly-banner">
    You have comment-only access to this note
  </div>
)}
```

Add SharePanel rendering (after CommentsPanel pattern, inside the editor surface wrapper):

```tsx
{sharePanelOpen && self && (
  <SharePanel
    noteId={note.id}
    ownerName={self.displayName}
    currentUserId={self.id}
    onClose={() => setSharePanelOpen(false)}
  />
)}
```

- [ ] **Step 5: Add banner CSS**

In `src/apps/tasks/components/Editor.css` (or the co-located CSS file), add:

```css
.editor-readonly-banner {
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.85rem;
  padding: var(--spacing-xs) var(--spacing-lg);
  text-align: center;
  border-bottom: 1px solid var(--accent);
}
```

- [ ] **Step 6: Type check**

```bash
npm run build
```

- [ ] **Step 7: Manual verify**

Start `npm run dev`. Open a note you own — confirm share button (network icon) appears in the toolbar. Click it — confirm SharePanel slides in from the right. Close it. No share button should appear on notes where `note.ownerId !== self.id`.

- [ ] **Step 8: Commit**

```bash
git add src/apps/tasks/components/Editor.tsx src/apps/tasks/components/Toolbar.tsx
git commit -m "feat: add SharePanel integration and comment-only read-only mode to editor"
```

---

## Task 11: FolderShareModal Component

**Files:**
- Create: `src/apps/tasks/components/FolderShareModal.tsx`
- Create: `src/apps/tasks/components/FolderShareModal.css`

- [ ] **Step 1: Create `src/apps/tasks/components/FolderShareModal.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  listFolderShares, addFolderShare, updateFolderShare, removeFolderShare,
  searchShareTargets,
  type FolderShare, type Permission, type ShareTarget,
} from "../../../storage/db";
import "./FolderShareModal.css";

interface Props {
  folderId: string;
  folderName: string;
  currentUserId: string;
  onClose: () => void;
}

export function FolderShareModal({ folderId, folderName, currentUserId, onClose }: Props) {
  const [shares, setShares] = useState<FolderShare[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ShareTarget[]>([]);
  const [pendingPermission, setPendingPermission] = useState<Permission>('edit');
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void listFolderShares(folderId).then(setShares).catch(() => {});
  }, [folderId]);

  const doSearch = useCallback((q: string) => {
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!q.trim()) { setResults([]); return; }
    searchRef.current = setTimeout(() => {
      void searchShareTargets(q).then(setResults).catch(() => setResults([]));
    }, 200);
  }, []);

  useEffect(() => { doSearch(query); }, [query, doSearch]);

  async function handleAdd(target: ShareTarget) {
    try {
      await addFolderShare(folderId, target.type, target.id, pendingPermission, currentUserId);
      setShares(await listFolderShares(folderId));
      setQuery("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleUpdatePermission(shareId: string, permission: Permission) {
    try {
      await updateFolderShare(shareId, permission);
      setShares((prev) => prev.map((s) => (s.id === shareId ? { ...s, permission } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemove(shareId: string) {
    try {
      await removeFolderShare(shareId);
      setShares((prev) => prev.filter((s) => s.id !== shareId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="fsm-backdrop" onClick={onClose}>
      <div className="fsm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fsm-head">
          <h3 className="fsm-title">Share "{folderName}"</h3>
          <button className="fsm-close" onClick={onClose}>✕</button>
        </div>

        {error && <p className="fsm-error">{error}</p>}

        {shares.length > 0 && (
          <ul className="fsm-share-list">
            {shares.map((s) => (
              <li key={s.id} className="fsm-share-row">
                <span className="fsm-type-badge">{s.granteeType === 'group' ? 'Group' : 'User'}</span>
                <span className="fsm-grantee-id">{s.granteeId.slice(0, 8)}…</span>
                <select
                  className="fsm-perm-select"
                  value={s.permission}
                  onChange={(e) => void handleUpdatePermission(s.id, e.target.value as Permission)}
                >
                  <option value="edit">Full Edit</option>
                  <option value="comment">Comment Only</option>
                </select>
                <button className="fsm-remove-btn" onClick={() => void handleRemove(s.id)}>✕</button>
              </li>
            ))}
          </ul>
        )}

        <div className="fsm-add-section">
          <div className="fsm-perm-row">
            <label className="fsm-perm-label">Permission:</label>
            <select
              className="fsm-perm-select"
              value={pendingPermission}
              onChange={(e) => setPendingPermission(e.target.value as Permission)}
            >
              <option value="edit">Full Edit</option>
              <option value="comment">Comment Only</option>
            </select>
          </div>
          <div className="fsm-search-wrap">
            <input
              className="fsm-search-input"
              placeholder="Search users or groups…"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
            {results.length > 0 && (
              <ul className="fsm-results">
                {results.map((r) => (
                  <li
                    key={r.id}
                    className="fsm-result-item"
                    onMouseDown={(e) => { e.preventDefault(); void handleAdd(r); }}
                  >
                    {r.avatarUrl
                      ? <img className="fsm-avatar" src={r.avatarUrl} alt="" />
                      : <span className="fsm-avatar fsm-avatar--placeholder">{(r.name ?? '?').slice(0, 1).toUpperCase()}</span>
                    }
                    <span className="fsm-result-name">{r.name}</span>
                    <span className="fsm-result-type">{r.type === 'group' ? 'Group' : 'User'}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/apps/tasks/components/FolderShareModal.css`**

```css
.fsm-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  animation: fadeIn 0.15s ease;
}

.fsm-modal {
  background: var(--bg);
  border-radius: var(--rounded-lg);
  box-shadow: 0 8px 32px rgba(0,0,0,0.18);
  width: 380px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow: hidden;
}

.fsm-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border);
}

.fsm-title {
  font-family: var(--font-heading);
  font-weight: var(--font-weight-heading);
  font-size: 1rem;
  margin: 0;
  color: var(--text);
}

.fsm-close {
  background: transparent; border: none; cursor: pointer;
  color: var(--muted); font-size: 1rem; padding: 4px;
}

.fsm-error { color: var(--error); font-size: 0.85rem; padding: 0 var(--spacing-lg); }

.fsm-share-list { list-style: none; padding: var(--spacing-sm) var(--spacing-lg); margin: 0; border-bottom: 1px solid var(--border); }

.fsm-share-row {
  display: flex; align-items: center; gap: var(--spacing-sm); padding: var(--spacing-xs) 0;
}

.fsm-type-badge {
  font-size: 0.7rem; background: var(--bg-alt); border-radius: var(--rounded-sm);
  padding: 1px 5px; color: var(--muted); flex-shrink: 0;
}

.fsm-grantee-id { flex: 1; font-size: 0.85rem; color: var(--text); }

.fsm-perm-select {
  border: 1px solid var(--border); border-radius: var(--rounded-sm);
  background: var(--bg); color: var(--text); font-size: 0.8rem; padding: 2px 4px;
}

.fsm-remove-btn {
  background: transparent; border: none; cursor: pointer; color: var(--muted); font-size: 0.85rem; padding: 2px 4px;
}
.fsm-remove-btn:hover { color: var(--error); }

.fsm-add-section { padding: var(--spacing-lg); display: flex; flex-direction: column; gap: var(--spacing-md); }
.fsm-perm-row { display: flex; align-items: center; gap: var(--spacing-sm); }
.fsm-perm-label { font-size: 0.8rem; color: var(--muted); flex-shrink: 0; }

.fsm-search-wrap { position: relative; }

.fsm-search-input {
  width: 100%; border: 1px solid var(--border); border-radius: var(--rounded-sm);
  padding: var(--spacing-sm); font-size: 0.9rem; background: var(--bg); color: var(--text); box-sizing: border-box;
}
.fsm-search-input:focus { outline: none; border-color: var(--accent); }

.fsm-results {
  position: absolute; top: 100%; left: 0; right: 0; background: var(--bg);
  border: 1px solid var(--border); border-radius: var(--rounded-sm);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1); list-style: none;
  padding: var(--spacing-xs) 0; margin: 2px 0 0 0; z-index: 10;
}

.fsm-result-item {
  display: flex; align-items: center; gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-md); cursor: pointer; font-size: 0.9rem;
}
.fsm-result-item:hover { background: var(--accent-soft); }

.fsm-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.fsm-avatar--placeholder {
  background: var(--accent-soft); color: var(--accent);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: var(--font-weight-heading);
}

.fsm-result-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fsm-result-type { font-size: 0.75rem; color: var(--muted); }
```

- [ ] **Step 3: Type check**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/apps/tasks/components/FolderShareModal.tsx src/apps/tasks/components/FolderShareModal.css
git commit -m "feat: add FolderShareModal component"
```

---

## Task 12: Sidebar — Folder "Share folder" Menu Option

**Files:**
- Modify: `src/apps/tasks/components/Sidebar.tsx`

- [ ] **Step 1: Add FolderShareModal state to FolderNode**

In `Sidebar.tsx`, add the import at the top:

```ts
import { FolderShareModal } from "./FolderShareModal";
```

Add `currentUserId` to `FolderNodeProps`:

```ts
interface FolderNodeProps {
  // ...existing props...
  currentUserId: string | null;
}
```

In `FolderNode`, destructure it:

```ts
function FolderNode({
  folder, depth, tree, docs, activeId, folders,
  onSelect, onDelete, onMoveDoc, onCreateInFolder,
  onCreateFolder, onRenameFolder, onDeleteFolder,
  selectMode, selectedIds, onToggleSelect,
  sharedFolderIds, currentUserId,
}: FolderNodeProps) {
```

Add state for the share modal:

```ts
const [shareModalOpen, setShareModalOpen] = useState(false);
```

- [ ] **Step 2: Add "Share folder" button to the folder context menu**

In `FolderNode`'s folder menu (inside `{menuOpen && !confirmDelete && (<div className="folder-menu">...`)}, add before the delete button:

```tsx
<button onMouseDown={(e) => e.preventDefault()} onClick={() => { closeMenu(); setShareModalOpen(true); }}>
  Share folder
</button>
<div className="folder-menu-sep" />
```

After the closing `</>` of `FolderNode`'s expanded children block, add the modal:

```tsx
{shareModalOpen && currentUserId && (
  <FolderShareModal
    folderId={folder.id}
    folderName={folder.name}
    currentUserId={currentUserId}
    onClose={() => setShareModalOpen(false)}
  />
)}
```

- [ ] **Step 3: Pass currentUserId through FolderNode tree**

In every place `FolderNode` is rendered (recursively and in `Sidebar`), add `currentUserId={currentUserId}`. This includes the recursive `<FolderNode>` inside `FolderNode` (children) and the top-level rendering in `Sidebar`.

In `Sidebar`'s `Props`, `currentUserId` is already being added (from Task 8). Pass it down to every `FolderNode`:

```tsx
<FolderNode
  {/* ...existing props... */}
  sharedFolderIds={sharedFolderIds}
  currentUserId={currentUserId}
/>
```

And inside `FolderNode`'s recursive children:

```tsx
<FolderNode
  {/* ...existing props... */}
  sharedFolderIds={sharedFolderIds}
  currentUserId={currentUserId}
/>
```

- [ ] **Step 4: Type check**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 5: Manual verify**

Start `npm run dev`. Right-click (or click `⋯`) on a folder in DohDocs. Confirm "Share folder" option appears. Click it — confirm FolderShareModal opens with the correct folder name. Add a share target via the search, confirm it appears in the shares list. Close and reopen to confirm the share persists.

- [ ] **Step 6: Commit**

```bash
git add src/apps/tasks/components/Sidebar.tsx
git commit -m "feat: add Share folder option to folder context menu"
```

---

## Task 13: End-to-End Smoke Test

No file changes — verify the full feature works together.

- [ ] **Step 1: Mint a fresh auth session**

```bash
npm run auth:mint
```

- [ ] **Step 2: Run the dev server**

```bash
npm run dev
```

- [ ] **Step 3: Verify Groups flow**

Open Admin → Groups tab.
1. Create a group "Test Group".
2. Add yourself as a member.
3. Reload — confirm group and membership persist.

- [ ] **Step 4: Verify note ownership isolation**

Open DohDocs → "Mine" view. Confirm you see only your own notes.
Open "All" view — "Shared with me" section should be empty initially.
Open "Shared" view — should show "Nothing shared with you yet".

- [ ] **Step 5: Verify sharing flow**

If there's a second test user available, share a note with them (via SharePanel, type their email). Switch to the second user. Open DohDocs → "Shared" view — confirm the note appears with the correct permission badge.

If only one test user, verify that the `listNoteShares` RPC works in Supabase Studio SQL Editor:

```sql
insert into note_shares (note_id, grantee_type, grantee_id, permission, granted_by, created_at)
values ('<note_id>', 'user', '<other_user_id>', 'comment', '<owner_id>', extract(epoch from now()) * 1000);

select public.resolve_note_permission('<note_id>', '<other_user_id>');
-- Expected: 'comment'
```

- [ ] **Step 6: Verify comment-only enforcement**

Open a note shared as 'comment' with the signed-in user. Confirm:
- Editor is not editable (clicking doesn't place a cursor for typing)
- Toolbar formatting controls are hidden
- Read-only banner appears
- Comment button is still visible and functional

---

## Task 14: Update Context Docs

**Files:**
- Modify: `.claude/context/dohdash.md`
- Modify: `.claude/context/tasks.md`

- [ ] **Step 1: Update dohdash.md**

In the **Storage constraint** section, update the tables list to include the new tables:

```
Tables: `profiles`, `app_access`, `pending_profiles`, `access_requests`, `admin_audit_log`,
`notes`, `folders`, `doc_comments`, `groups`, `group_members`, `note_shares`, `folder_shares`.
```

Add a **Platform Groups** subsection after the Admin panel section:

```markdown
## Platform Groups

`groups (id, name, description, created_by, created_at)` and
`group_members (group_id, user_id, added_by, added_at)` live at the shell level — not
in any single app — so any future app (Job Files, Calendar, etc.) can target groups for
sharing. All authenticated users can read both tables (needed for share target lookup);
only admins can write. Managed via the Groups tab in AdminDashboard via `GroupsPanel.tsx`.
```

- [ ] **Step 2: Update tasks.md**

Add a **Sharing & Permissions** section:

```markdown
## Sharing & Permissions

`resolve_note_permission(note_id, user_id)` — SECURITY DEFINER SQL function; the single
source of truth for all note access decisions. Returns `'owner' | 'edit' | 'comment' | null`.
Called by RLS on `notes` (SELECT/UPDATE) and by `get_notes_effective_permissions()` for
batch sidebar permission loading.

Permission resolution order (see migration 0011):
1. Owner → `'owner'`
2. Note-level grants (direct + group) → most permissive
3. Folder-level grants → most permissive
Note-level overrides folder-level (per design choice — either direction).

`DocMeta` gains optional fields: `ownerName`, `ownerAvatarUrl`, `effectivePermission`.
`Folder` gains `ownerId`.
`listDocs(query, view, userId)` — `view` is `'mine' | 'shared' | 'all'`.

**View modes** (`localStorage` key `dohdash-tasks-view`):
- `mine`: `owner_id = userId` filter, folder tree, `effectivePermission: 'owner'`
- `shared`: `owner_id != userId` filter, grouped by owner name, permission badge
- `all`: no filter, folder tree for owned + "Shared with me" flat section below

**New components:**
- `SharePanel.tsx` — slides in from right inside editor surface; manages `note_shares`
- `FolderShareModal.tsx` — centered modal; manages `folder_shares`; opened from folder `⋯` menu

**Comment-only enforcement:** When `note.effectivePermission === 'comment'`, TipTap
`editor.setEditable(false)`, Toolbar formatting controls hidden, read-only banner shown.
Comment functionality remains active.
```

- [ ] **Step 3: Type check and commit**

```bash
npm run build
git add .claude/context/dohdash.md .claude/context/tasks.md
git commit -m "docs: update context files for groups and DohDocs sharing"
```

---

## Post-Implementation Checklist

- [ ] Groups: create, rename, describe, add/remove members, delete — all work and persist
- [ ] Admin Groups tab is visible only to admins
- [ ] Note ownership: "Mine" view shows only owned notes; other users' notes are invisible
- [ ] Sharing: note shared as 'edit' → recipient can edit; note shared as 'comment' → read-only mode
- [ ] Permission override: folder share 'edit' + note share 'comment' → recipient gets 'comment' (note wins)
- [ ] Group sharing: share note with a group → all group members gain access at the specified level
- [ ] Folder sharing: share a folder → all notes in it inherit the folder-level permission (unless note-level overrides)
- [ ] Sidebar "Shared" view shows correct owner badges and permission badges
- [ ] Sidebar "All" view shows owned notes in folder tree + shared notes in divider section
- [ ] `supabase db push` has been run and all 2 new migrations are applied
- [ ] No direct Supabase calls outside `db.ts` (except existing permitted exceptions in `useAuthState.ts`, `realtime.ts`, Chicken Scratch)
