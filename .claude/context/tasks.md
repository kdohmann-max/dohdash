# Tasks (DohDocs) — Context

App id `tasks`; displayed as "DohDocs" via `CompanyInfo.md` `appNames`.

## Entry point & state

`src/apps/tasks/TasksApp.tsx` — doc list, folder tree, active doc. No global state manager; plain `useState`.
- `docs: DocMeta[]` — filtered by `search` (250 ms debounce, full-text via `listDocs(query)`)
- `folders: Folder[]` — full tree
- `active: DohDoc | null` — open document
- `sort: "edited" | "name"` — persisted to `localStorage`

## Editor

`src/apps/tasks/components/Editor.tsx` — TipTap + `tiptap-markdown`; rich editor and raw Markdown stay in sync via the markdown plugin. Extensions assembled in `editor/extensions.ts` (`buildExtensions()`).
- `sourceMode: boolean` — WYSIWYG ↔ raw Markdown toggle
- **Auto-save: 400 ms debounce per keystroke** → `saveDoc()`. No manual save button.
- Images: base64 data URLs, no Storage bucket — `uploadImage()` in `db.ts` just encodes.

## Custom TipTap extensions

`src/apps/tasks/editor/`

| Extension | File | What it does |
|-----------|------|--------------|
| `FormatSelector` | `FormatSelector.ts` | Single custom mark with a `name` attr — drives P1/P2/P3/Comment highlighting (not separate mark types) |
| `DocCommentMark` | `CommentMark.ts` | Anchors a comment thread (`docComment` mark) to a text range; mark id matches the `doc_comments` row id |
| `AutoTask` | `autoTask.ts` | `- [ ]` lines auto-convert to task-list items on input |
| `HeadingFormat` | `headingFormat.ts` | H1–H4 rendered with `font-variant: small-caps` |
| `math` | `math.ts` | Inline arithmetic auto-evaluated (wired via Editor/Toolbar, not `buildExtensions`) |
| `ArchiveDecorations` | `archive.ts` | "Archive Done" uses ProseMirror decorations — archived tasks stay in the doc, visually separated, not moved |

Format registry: `data/formattingSelectors.ts` — P1/P2/P3/Comment/Math are entries for the single `formatSelector` mark. New format = new registry entry, not a new TipTap mark. (Toolbar "F" button opens this selector.)

## Live collaboration

`src/storage/realtime.ts` — Supabase **broadcast** channels (no `postgres_changes` publication; every write flows through this app, so writers notify). Two kinds:
- `doc:<id>` — per-document. Presence tracks who has the doc open + an `editing` flag (`PresenceBar.tsx`); `doc-updated` broadcasts carry saved markdown so other viewers refresh live. Presence is keyed by `userId` (same user in two tabs = one peer); `self:false` plus a `senderId` filter suppress echoes across a user's own tabs.
- `docs-list` — one app-lifetime channel; `notifyDocsListChanged()` fires after any notes/folders mutation, `subscribeDocsList()` refreshes the sidebar (300 ms debounced).

## Comments

Google-Docs-style threads. `doc_comments` table; `CommentMark.ts` anchors them in the doc, `components/CommentsPanel.tsx` is the side panel. Threaded replies cascade via `parent_id`. Caller supplies the comment `id` (`crypto.randomUUID()`) so the editor can place the mark before the row exists. `db.ts`: `listDocComments`, `createDocComment`, `updateDocComment`, `setDocCommentResolved`, `deleteDocComment`.

## Storage

All via `src/storage/db.ts`. Tables: `notes (id, title, markdown, updated_at, folder_id, owner_id)`, `folders (id, name, parent_id, created_at, owner_id)`, `doc_comments`.

Docs/folders: `listDocs(query?)`, `getDoc(id)`, `createDoc(folderId, ownerId)`, `saveDoc(doc)`, `deleteDoc(id)`, `moveDoc(docId, folderId)`, `listFolders()`, `createFolder(name, parentId, ownerId)`, `renameFolder(id, name)`, `deleteFolder(id)`.

## Gotchas

- **Example note**: seeded once via `localStorage` flag `dohdash-tasks-example-seeded` — won't re-create if deleted.
- **Recursive folder tree**: `Sidebar.tsx` builds a `Map<parentId, Folder[]>` and renders recursively, not a flat list.
- **Rich clipboard**: `share.ts` copies both HTML and Markdown so paste into Word/Gmail keeps formatting.
- **PDF export**: browser print dialog, no server-side PDF.
