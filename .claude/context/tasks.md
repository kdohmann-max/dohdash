# Tasks (DohDocs) — Context

App id `tasks`; displayed as "DohDocs" via `CompanyInfo.md` `appNames`.

## Entry point & state

`src/apps/tasks/TasksApp.tsx` — doc list, folder tree, active doc. No global state manager; plain `useState`.
- `docs: DocMeta[]` — filtered by `search` (250 ms debounce) and `view` (Mine/Shared/All), via `listDocs(query, view, userId)`
- `folders: Folder[]` — full tree
- `active: DohDoc | null` — open document; carries `effectivePermission: 'owner'|'edit'|'comment'` propagated from `DocMeta`
- `sort: "edited" | "name"` — persisted to `localStorage`
- `view: ViewMode` (`'mine'|'shared'|'all'`) — persisted to `localStorage` as `dohdash-tasks-view`
- `sharedFolderIds: Set<string>` — owned folder IDs that have active shares (for the share icon in sidebar)

## Editor

`src/apps/tasks/components/Editor.tsx` — TipTap + `tiptap-markdown`; rich editor and raw Markdown stay in sync via the markdown plugin. Extensions assembled in `editor/extensions.ts` (`buildExtensions()`).
- `sourceMode: boolean` — WYSIWYG ↔ raw Markdown toggle
- **Auto-save: 400 ms debounce per keystroke** → `saveDoc()`. No manual save button.
- **Save-state indicator** (`saveStatus: "idle"|"saving"|"saved"|"error"`): shown in the `.view-toggle` bar ("Saving…" → "Saved" → "Offline — will retry"). On failure, the latest markdown is stashed to `localStorage` key `dohdash-doc-backup:<docId>` (`{markdown, updatedAt}`) and retried with exponential backoff (1s→30s cap); `pendingMarkdownRef` guards stale retries. On open, a backup newer than the server `updatedAt` is restored and re-flushed; otherwise dropped.
- Images: base64 data URLs, no Storage bucket — `uploadImage()` in `db.ts` just encodes.

## Custom TipTap extensions

`src/apps/tasks/editor/`

| Extension | File | What it does |
|-----------|------|--------------|
| `FormatSelector` | `FormatSelector.ts` | Single custom mark with a `name` attr — drives P1/P2/P3/Comment/user-tag highlighting (not separate mark types). Also has a `users` attr (only for `user-tag`) and a `setUserTag(names)` command |
| `DocCommentMark` | `CommentMark.ts` | Anchors a comment thread (`docComment` mark) to a text range; mark id matches the `doc_comments` row id |
| `AutoTask` | `autoTask.ts` | `- [ ]` lines auto-convert to task-list items on input |
| `HeadingFormat` | `headingFormat.ts` | H1–H4 rendered with `font-variant: small-caps` |
| `math` | `math.ts` | Inline arithmetic auto-evaluated (wired via Editor/Toolbar, not `buildExtensions`) |
| `ArchiveDecorations` | `archive.ts` | "Archive Done" uses ProseMirror decorations — archived tasks stay in the doc, visually separated, not moved |

Format registry: `data/formattingSelectors.ts` — P1/P2/P3/Comment/"TAG with user"/Math are entries for the single `formatSelector` mark (each has a `kind`: `mark` | `math` | `user`). New format = new registry entry, not a new TipTap mark. (Toolbar **TAG** button — formerly "F" — opens this ribbon; the editor toolbar's share button is now the word **Share**, not an icon.)

**"TAG with user"** (`kind: "user"`, id `user-tag`): selecting it opens a checkbox picker of all `listProfiles()` users (filter box) in `Toolbar.tsx`; the captured selection range is re-applied via `setUserTag(names)`. Renders as a green-highlighted `fmt-user-tag` span carrying `data-users` (+ a `Tagged: …` title tooltip). Markdown serialization emits the span **plus a trailing `<!-- tagged: Name, Name -->` HTML comment** listing the people — `data-users` is what actually round-trips; the comment is the human-readable/greppable record requested for the .md.

## Live collaboration

`src/storage/realtime.ts` — Supabase **broadcast** channels (no `postgres_changes` publication; every write flows through this app, so writers notify). Two kinds:
- `doc:<id>` — per-document. Presence tracks who has the doc open + an `editing` flag (`PresenceBar.tsx`); `doc-updated` broadcasts carry saved markdown so other viewers refresh live. Presence is keyed by `userId` (same user in two tabs = one peer); `self:false` plus a `senderId` filter suppress echoes across a user's own tabs.
- `docs-list` — one app-lifetime channel; `notifyDocsListChanged()` fires after any notes/folders mutation, `subscribeDocsList()` refreshes the sidebar (300 ms debounced).

## Comments

Google-Docs-style threads. `doc_comments` table; `CommentMark.ts` anchors them in the doc, `components/CommentsPanel.tsx` is the side panel. Threaded replies cascade via `parent_id`. Caller supplies the comment `id` (`crypto.randomUUID()`) so the editor can place the mark before the row exists. `db.ts`: `listDocComments`, `createDocComment`, `updateDocComment`, `setDocCommentResolved`, `deleteDocComment`.

## Sharing & permissions

Notes and folders are **private to their owner by default**. Access is granted via `note_shares` / `folder_shares` rows (polymorphic grantee: `user` or `group`). Permission tiers: `'edit'` (full write) or `'comment'` (read + thread only).

Permission is resolved server-side by the `resolve_note_permission(note_id, user_id)` SQL `SECURITY DEFINER` function — RLS on `notes` calls it directly. Resolution order: (1) owner → `'owner'`; (2) note-level grants (direct user + group expansion, most permissive); (3) folder-level grants (same); note-level overrides folder-level entirely.

`DocMeta` carries `effectivePermission: 'owner'|'edit'|'comment'|null`, `ownerName`, `ownerAvatarUrl` for display in the sidebar and editor.

**Editor enforcement:** when `effectivePermission === 'comment'`, TipTap's `editable` is set to `false`; all formatting toolbar controls are hidden; a read-only banner appears; the comment button stays visible.

**Share UI:**
- `SharePanel` (`src/apps/tasks/components/SharePanel.tsx`) — slide-in panel from the right, triggered by the share button in the Editor toolbar (owners only). **Checkbox roster:** loads all `listProfiles()` (minus the owner) + `listGroups()` into one list; each row has a checkbox (already-shared float to the top), a filter box narrows by name/email, checking adds a share at the "New shares get" default permission, unchecking removes it, and shared rows show an inline Full Edit / Comment Only select. Chosen for non-technical users (see CLAUDE.md "UX mandate") — no type-ahead.
- `FolderShareModal` (`src/apps/tasks/components/FolderShareModal.tsx`) — modal opened from the folder `⋯` context menu ("Share folder"). Same checkbox-roster pattern as `SharePanel`.

**Sidebar views:**
- `Mine` — only docs owned by current user; owned folder tree shown
- `Shared` — docs shared with current user, grouped by owner with permission badge
- `All` — owned docs + folder tree, then a "Shared with me" flat section

Folders owned by current user that have active shares show a faint share icon (SVG) in the sidebar.

## Storage

All via `src/storage/db.ts`. Tables: `notes (id, title, markdown, updated_at, folder_id, owner_id)`, `folders (id, name, parent_id, created_at, owner_id)`, `doc_comments`, `note_shares`, `folder_shares`.

Docs/folders: `listDocs(query?, view?, userId?)`, `getDoc(id)`, `createDoc(folderId, ownerId)`, `saveDoc(doc)`, `deleteDoc(id)`, `moveDoc(docId, folderId)`, `listFolders()`, `createFolder(name, parentId, ownerId)`, `renameFolder(id, name)`, `deleteFolder(id)`.

Share functions: `listNoteShares(noteId)`, `addNoteShare(...)`, `updateNoteShare(id, permission)`, `removeNoteShare(id)`, `listFolderShares(folderId)`, `addFolderShare(...)`, `updateFolderShare(id, permission)`, `removeFolderShare(id)`, `searchShareTargets(query)` (returns `ShareTarget[]` combining profiles + groups), `listAllVisibleFolderShares()` (for sidebar share icons).

## Gotchas

- **Example note**: seeded once via `localStorage` flag `dohdash-tasks-example-seeded` — won't re-create if deleted.
- **Recursive folder tree**: `Sidebar.tsx` builds a `Map<parentId, Folder[]>` and renders recursively, not a flat list.
- **Rich clipboard**: `share.ts` copies both HTML and Markdown so paste into Word/Gmail keeps formatting.
- **PDF export**: browser print dialog, no server-side PDF.
- **No Sidebar.css**: sidebar styles live in `TasksApp.css` (scoped under `.tasks-app`).
- **`as unknown as NoteRow[]` cast in `listDocs`**: Supabase's join return type doesn't match the manually typed `NoteRow` with nested `owner` profile — the cast is intentional (same pattern as `listDocComments`).
- **Share grantee name resolution**: PostgREST can't FK-join polymorphic `grantee_id` (references either profiles or groups). `SharePanel` and `FolderShareModal` load `listProfiles()` + `listGroups()` on mount; the roster rows already carry display names, and existing shares are matched by `granteeId` against that combined list.
- **`searchShareTargets` is currently unused by the UI** — the share components moved to a full checkbox roster, so the type-ahead search RPC has no caller. Kept in `db.ts` as a reusable export.
