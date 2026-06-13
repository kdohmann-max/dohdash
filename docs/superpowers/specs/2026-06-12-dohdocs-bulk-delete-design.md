# DohDocs: Bulk Delete Notes — Design

## Overview

Add a "select multiple notes and delete them" workflow to the DohDocs sidebar (`src/apps/tasks/components/Sidebar.tsx`), driven from `TasksApp.tsx`. Today, deleting a note requires opening its "⋯" menu and confirming one at a time via `onDelete(id)` → `deleteDoc(id)`. This adds a sidebar-wide selection mode for deleting many notes in one action.

## Storage: batch delete

Add to `src/storage/db.ts`, alongside the existing `deleteDoc`:

```ts
export async function deleteDocs(ids: string[]): Promise<void> {
  const { error } = await supabase.from("notes").delete().in("id", ids);
  if (error) throw error;
}
```

One round trip for the whole batch. No other Supabase access points are introduced — consistent with the `db.ts`-only storage rule.

## State & handlers (`TasksApp.tsx`)

New state:
- `selectMode: boolean` — whether the sidebar is in multi-select mode.
- `selectedIds: Set<string>` — ids of currently checked notes.

New handlers:
- `handleToggleSelectMode()` — flips `selectMode`. Turning it off also clears `selectedIds`.
- `handleToggleSelect(id: string)` — adds/removes `id` from `selectedIds`.
- `handleBulkDelete()`:
  1. Calls `deleteDocs([...selectedIds])`.
  2. Reloads `docs` via `listDocs(search)` (bump `loadSeq.current` as existing handlers do).
  3. If `active?.id` is in `selectedIds`, reuse the existing "open most recent remaining doc, or null + clear `remoteDeleted`" fallback from `handleDelete`.
  4. Clears `selectedIds` and sets `selectMode` to `false`.
  5. Calls `notifyDocsListChanged()` once for the whole batch.

These are passed down to `Sidebar`.

## Sidebar UI (`Sidebar.tsx`)

**New props:** `selectMode: boolean`, `selectedIds: Set<string>`, `onToggleSelectMode: () => void`, `onToggleSelect: (id: string) => void`, `onBulkDelete: () => void`.

**Header (`sidebar-head` / `sidebar-controls`):**
- Normal mode: add a "Select" button alongside the existing new-folder (+), new-doc (+), and close (✕) buttons.
- Select mode: the create/select buttons are replaced by a bar showing "N selected", a "Delete" button, and a "Cancel" button.
  - "Cancel" calls `onToggleSelectMode()` (which also clears selection in the parent).
  - "Delete" is disabled when `selectedIds.size === 0`.
  - Clicking "Delete" (N ≥ 1) swaps the bar for an inline confirm: "Delete N notes?" with "Yes, delete" / "Cancel" buttons, mirroring the existing per-item delete-confirm pattern (`doc-menu` confirm step in `DocItem`). "Yes, delete" calls `onBulkDelete()`; "Cancel" returns to the N-selected bar.

**`DocItem`:**
- New prop: receives `selectMode` and `selected: boolean` (computed by the caller as `selectedIds.has(doc.id)`), plus `onToggleSelect`.
- When `selectMode` is true:
  - Render a checkbox at the start of the row reflecting `selected`.
  - Clicking the row or checkbox calls `onToggleSelect(doc.id)` instead of `onSelect(doc.id)` (doesn't open the doc).
  - The "⋯" move/delete menu button is hidden.
- Outside select mode, behavior is unchanged.

**Folders / `FolderNode`:**
- Folder rows render normally in both modes — no checkbox on folders themselves, and folder rename/delete/move/create actions remain available even while `selectMode` is on.
- Nested `DocItem`s within folders receive the same `selectMode`/`selected`/`onToggleSelect` props as root-level docs, so selection spans the whole tree via the flat `selectedIds: Set<string>`.

## Edge cases

- **Empty doc list:** "Select" button still renders; entering select mode with nothing to check is harmless (N stays 0, Delete stays disabled).
- **Active doc among deleted:** handled via the existing "open most recent remaining doc, or show empty state" fallback already used by `handleDelete`.
- **Stale selected id** (e.g., another user deleted a selected note via realtime sync before the bulk delete runs): `deleteDocs` with an id that no longer matches any row is a no-op for that id — `.delete().in("id", ids)` simply deletes whatever still matches, no error.
- **Search active while selecting:** `selectedIds` persists across search changes (selection spans "any notes anywhere" per design choice), even if a selected note is filtered out of the visible list by search.

## Styling

New classes in `TasksApp.css` (or a new co-located stylesheet if `TasksApp.css` already covers Sidebar — follow existing convention):
- `.select-bar`, `.select-count` for the header select-mode bar.
- `.doc-checkbox` for the per-row checkbox.

All using existing design tokens — `--accent` for the Select/checkbox accent, `--error` for the Delete button (destructive action per style guide), `--spacing-*` / `--rounded-*` for layout. No new colors introduced.

## Testing

- Manual verification: toggle select mode on/off; check/uncheck notes across root and nested folders; bulk delete with the active doc included and not included; confirm and cancel flows at both the bulk-delete and per-bulk-delete-confirm steps; empty-selection state (Delete disabled).
- No automated test suite currently covers `Sidebar.tsx` — consistent with existing coverage, no new test infrastructure is added for this feature.
