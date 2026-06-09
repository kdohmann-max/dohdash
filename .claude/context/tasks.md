# Tasks (DohDocs) — Context

## Entry point & state

`src/apps/tasks/TasksApp.tsx` — manages doc list, folder tree, and active document. No global state manager; plain `useState`.

Key state:
- `docs: DocMeta[]` — filtered by `search` (debounced 250 ms, full-text via `listDocs(query)`)
- `folders: Folder[]` — full folder tree
- `active: DohDoc | null` — currently open document
- `sort: "edited" | "name"` — persisted to `localStorage`

## Editor

`src/apps/tasks/components/Editor.tsx` — TipTap + `tiptap-markdown` extension. Rich editor and raw Markdown stay in sync via the markdown plugin.

- `sourceMode: boolean` — toggles WYSIWYG ↔ raw Markdown view
- **Auto-save: 400 ms debounce after each keystroke**, calls `saveDoc()`. There is no manual save button.
- Images: inserted as base64 data URLs — no Supabase Storage bucket. `uploadImage()` in `db.ts` just encodes to base64.

## Custom TipTap extensions

`src/apps/tasks/editor/`

| Extension | File | What it does |
|-----------|------|--------------|
| `FormatSelector` | `extensions.ts` | Single custom mark with a `name` attribute — drives P1/P2/P3/Comment highlighting. Not separate mark types. |
| `autoTask` | `autoTask.ts` | Lines starting with `- [ ]` auto-convert to TipTap task list items on input |
| `headingFormat` | `headingFormat.ts` | H1–H4 rendered with `font-variant: small-caps` |
| `math` | `math.ts` | Inline arithmetic expressions auto-evaluated in the document |
| Archive | `archive.ts` | "Archive Done" uses ProseMirror decorations — archived tasks stay in the doc, visually separated, not moved |

Format options registry: `src/apps/tasks/data/formattingSelectors.ts` — P1/P2/P3/Comment/Math are registry entries for the single `formatSelector` mark. Adding a new format = add a registry entry, not a new TipTap mark.

## Storage

All calls go through `src/storage/db.ts`.

Tables: `notes (id, title, markdown, updated_at, folder_id, owner_id)`, `folders (id, name, parent_id, created_at, owner_id)`.

Key functions: `listDocs(query?)`, `getDoc(id)`, `createDoc(folderId, ownerId)`, `saveDoc(doc)`, `deleteDoc(id)`, `moveDoc(docId, folderId)`, `listFolders()`, `createFolder(name, parentId, ownerId)`, `renameFolder(id, name)`, `deleteFolder(id)`.

## Gotchas

- **Example note**: seeded once on first load via `localStorage` flag `dohdash-tasks-example-seeded`. Won't re-create if deleted.
- **Recursive folder tree**: `Sidebar.tsx` builds a `Map<parentId, Folder[]>` and renders recursively — not a flat sorted list.
- **Rich clipboard**: `share.ts` copies both HTML and Markdown flavors so paste into Word/Gmail preserves formatting.
- **PDF export**: triggers the browser print dialog (no server-side PDF).
- **Toolbar "F" button**: opens the format selector for P1/P2/P3/Comment/Math marks — driven by `formattingSelectors.ts`.
