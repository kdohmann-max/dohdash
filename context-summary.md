# DohDash Context Files Summary

> **Reference only** — not used by Claude Code for any work.

## Quick Overview

DohDash is a "company OS" dashboard built on **React 19 + TypeScript + Vite**, with **Supabase** backend (Postgres + Auth + RLS). Portable to another company by swapping `public/CompanyInfo.md` + credentials.

**Shipped apps:** Tasks (DohDocs) with live collaboration + comments, Chicken Scratch (handwriting/blueprint recognition). **Stubs:** Job Files, Calendar, Contacts, Time Tracker, Expense Tracker, Clean Up.

---

## Context Files

### `CLAUDE.md` (59 lines, 531 words)
**Project-level overview.** Entry point for all context.

- **Tech stack:** React 19, TypeScript 6, Vite 8, Supabase, react-router-dom 7, gray-matter
- **Key architecture:** all Supabase access isolated in `src/storage/db.ts`; credentials via env vars
- **Auth:** discriminated-union state machine in `useAuthState.ts` (loading/signed-out/pending-access/authenticated/error)
- **User provisioning:** email pre-authorization (pending_profiles table + trigger)
- **App permissions:** `app_access` table gates per-app; `app_id` is a string key into code-defined `APP_REGISTRY`
- **CSS:** per-component co-located `.css` files consuming CompanyInfo-driven CSS custom properties
- **Portability:** `CompanyInfo.md` fetched at runtime, no rebuild needed to re-brand

---

### `.claude/context/dohdash.md` (52 lines, 402 words)
**Shell context:** auth, provisioning, admin, routing.

- **Auth state machine:** pure `deriveAuthState(session, outcome)` function; `pending-access` (no DB row) vs `error` (fetch failed) are intentionally distinct
- **Routing:** `BrowserRouter` + `AuthGate` layout route for `/dashboard/*`; OAuth redirect stored in sessionStorage
- **Admin panel** (`src/admin/AdminDashboard.tsx`, 3 tabs):
  - Users: email pre-authorization, role toggle, user removal (cascades but keeps docs)
  - Access Requests: self-service onboarding with accept/reject flow
  - Activity: last-sign-in per user
  - Audit log: dual-write (client-side for direct-table actions, SQL-side for RPCs)
- **Provisioning flow:** admin email grant → `pending_profiles` or `profiles` based on sign-in status; `handle_new_user` trigger promotes pending → profiles on first sign-in
- **`is_admin()`:** `SECURITY DEFINER` function avoids RLS self-referential recursion
- **CompanyInfo:** runtime fetch, CSS var injection, context provider for `companyName`/`dashboardName`/`adminContact`/`logo`/`appNames`
- **Storage exceptions:** `supabase.auth` in useAuthState, `supabase.functions.invoke` in Chicken Scratch, `src/storage/realtime.ts` (Realtime broadcast)
- **Tables:** profiles, app_access, pending_profiles, access_requests, admin_audit_log, notes, folders, doc_comments

---

### `.claude/context/tasks.md` (56 lines, 491 words)
**DohDocs (Tasks app):** editor, extensions, live collaboration, comments.

- **Entry:** `TasksApp.tsx` manages doc list, folder tree, active doc; plain `useState` (no global state)
- **Editor:** TipTap + `tiptap-markdown`; WYSIWYG ↔ raw Markdown toggle; 400 ms auto-save debounce; base64 image embedding
- **Extensions** (`src/apps/tasks/editor/`):
  - `FormatSelector.ts` — P1/P2/P3/Comment highlighting (single mark, registry-driven)
  - `CommentMark.ts` — anchors comment threads to text ranges
  - `AutoTask.ts` — `- [ ]` lines → task-list items
  - `HeadingFormat.ts` — H1–H4 rendered as small-caps
  - `math.ts` — inline arithmetic auto-evaluation (wired via Editor/Toolbar)
  - `archive.ts` — ProseMirror decorations for archived tasks (visually separated, not moved)
- **Format registry:** `data/formattingSelectors.ts` — extensible per-format entries (new format = new registry entry, not a new TipTap mark)
- **Live collaboration:** `src/storage/realtime.ts` broadcast channels:
  - `doc:<id>` — presence (who's viewing, editing flag), live markdown refresh; `self:false` + `senderId` filter suppress own-tab echoes
  - `docs-list` — sidebar refresh on any notes/folders mutation (300 ms debounced)
- **Comments:** Google-Docs-style threads; `doc_comments` table with `parent_id` for replies; `CommentsPanel.tsx` side panel; full CRUD in `db.ts`
- **Storage:** `notes`, `folders` tables; full CRUD functions
- **Gotchas:** example note seeded once per browser; recursive folder tree; rich clipboard (HTML + Markdown); PDF via print dialog

---

### `.claude/context/chicken-scratch.md` (66 lines, 531 words)
**Chicken Scratch:** handwriting + blueprint recognition.

- **State machine:** idle → processing → (done | error); no edge-function retry
- **Result types:** handwriting (markdown string) or blueprint (Shape[] + DimensionLabel[])
- **Edge function:** `process-scratch` called via `supabase.functions.invoke()`
  - Input: base64 image + mimeType + model (validated against `ALLOWED_MODELS` in function)
  - `scratch_cache` keyed on `(image_hash, model)` for dedup
  - Client-side 10 MB size limit
  - **Error gotcha:** real error message wrapped in `FunctionsHttpError.context` — must call `.context.json()`
- **Blueprint rendering:** `BlueprintRenderer.tsx` → Canvas2D drawing via `blueprintDraw.ts`
  - `MODEL_SIZE = 1000` (logical space), `RENDER_SCALE = 2` (crisp raster)
  - Fixed "technical drawing" palette (white bg, charcoal, gray) — independent of app theme
  - Exports `canvasToBlob()` / `canvasToDataUrl()` for PNG download/copy
- **Dimensions.ts** (pure logic):
  - `parseDimension()` — label text → inches (feet/inches notation, feet, inches, m, cm, mm, bare number)
  - `matchDimensionLabels()` — label → nearest rect edge (top=width, left=height) or line segment
  - `adjustShapeProportions()` — 3-phase rescaling: (1) correct drawn height to real aspect ratio; (2) compute globalScale as median; (3) rescale single-dimension shapes
  - `buildDimensionAnnotations()` — matches → dimension lines with extension/ticks/rotated labels
- **ResultPanel:** send to DohDocs, copy, download
  - Handwriting: markdown text / .md file
  - Blueprint: base64 PNG `![](data:image/png;...)` embedded + dimension labels as markdown list / PNG file

---

### `.claude/context/styleguide.md` (89 lines, 542 words)
**Design system:** tokens, typography, spacing, icons, themes.

- **Philosophy:** clean, minimal, professional; rounded feel (Comfortaa); no decorative flourishes
- **Colors:** CSS custom properties (never hardcoded hex)
  - `--bg` (white), `--bg-alt` (light gray), `--border`, `--text` (dark), `--muted`, `--accent` (green), `--accent-soft`, `--error` (red)
  - Dark equivalents (`--dark-*`) swap when `[data-theme="dark"]` on `<html>`
  - Rules: use vars not hardcoded values; buttons use `color: var(--bg)` not white; use `--error` for destructive only
- **Typography:** fonts from CompanyInfo.md as vars (never set `font-family` directly)
  - `--font-display/-heading/-body` + `--font-weight-*` (default: Comfortaa all three)
- **Spacing:** 5-step scale (xs 4px, sm 8px, md 12px, lg 16px, xl 32px); no magic numbers
- **Border radius:** sm 4px (badges), md 6px (cards/buttons), lg 8px (modals)
- **Icons:** `src/icons/index.tsx` only place to define/import; use `svgProps(size)` helper; stroke-only, inherit color via `currentColor`
- **Light/dark theme:** `data-theme` on `<html>` managed by `src/theme.ts`; every color must work in both modes
- **Component patterns:** cards, buttons, destructive actions (includes CSS snippets)
- **Per-component CSS:** co-located `.css` files; scope under unique wrapper class; inherit shell tokens

---

## Key Architecture Rules

1. ✋ **All Supabase DB calls go through `src/storage/db.ts`** (permitted exceptions: `supabase.auth`, `supabase.functions.invoke`, `realtime.ts`)
2. ✋ **Never `git commit` or `git push` without explicit user approval** (live Vercel deploy is immediate)
3. ✋ **Never hardcode colors, icon SVGs, or pixel values** (use design system tokens)
4. ✋ **No comments unless the WHY is non-obvious** (well-named code is self-documenting)
5. ✋ **Auth state is a discriminated union** (never independent booleans; `pending-access` vs `error` are intentional)

## Gotchas to Watch

- Example note in Tasks seeded once per browser (won't re-create if deleted)
- Recursive folder tree rendered from a `Map<parentId, Folder[]>` (not flat)
- `FunctionsHttpError` in Chicken Scratch wraps the error message in `.context` (must unwrap)
- Dark-mode CSS vars must be set in `[data-theme="dark"]` rule in `index.css` (not hardcoded)
- Presence in live collaboration suppressed own-tab echoes via `self:false` + `senderId` filter
- User removal cascades to auth.users but keeps their docs (`owner_id` → null)
- `is_admin()` is `SECURITY DEFINER` to avoid RLS recursion on `profiles` self-reference

## Tables (Supabase)

- `profiles` (id, email, display_name, avatar_url, role, created_at) — RLS enabled
- `app_access` (user_id, app_id, granted_by, created_at) — RLS enabled
- `pending_profiles` (email, role, granted_by, created_at) — RLS enabled; promoted to profiles by trigger
- `access_requests` (id, email, display_name, avatar_url, requested_at) — self-service onboarding
- `admin_audit_log` (id, actor_id, action, target, detail, created_at) — dual-write (client + RPC)
- `notes` (id, title, markdown, updated_at, folder_id, owner_id) — DohDocs
- `folders` (id, name, parent_id, created_at, owner_id) — DohDocs
- `doc_comments` (id, doc_id, parent_id, author_id, content, anchor_text, resolved_at, created_at, updated_at) — threaded, anchored

---

**Last updated:** 2026-06-12 (after context optimization)
