# Implementation Plan — Platform Refactor + Existing-App Polish

> **Status:** Not started. Written 2026-06-16.
> **How to use:** Each phase is independently shippable. Execute top to bottom; do
> not start a phase until the prior phase's acceptance checks pass. A fresh agent
> can pick up any phase cold from the "Context" + "Files" notes.

## Hard constraints (apply to every phase)

- **NEVER `git commit`, `git push`, or deploy without explicit user approval.** A
  push to `master` triggers a live Vercel **prod** deploy (see `CLAUDE.md`).
- All Supabase DB access stays in `src/storage/` only (the one-client rule). The
  db.ts split in Phase 3 keeps that invariant — it just moves code into sibling
  files that share the same client.
- Follow `.claude/context/styleguide.md` (no hardcoded colors/px, shared icons).
- `npm run build` (runs `tsc -b` then Vite) must pass before a phase is "done".
- Diff-only discipline: don't rewrite unaffected code.

---

## PHASE 1 — Registry owns the app

**Problem.** Adding an app touches 3–4 disconnected places: `registry.tsx`
(metadata), a hand-written branch in `src/App.tsx` `AppRoute()`, an icon, and any
db calls. The `if (appId === "tasks")` chain at `src/App.tsx:25-31` is a manual
switch every new app must extend.

**Goal.** The registry is the single source of truth. Adding an app = one registry
entry (+ its folder, + icon).

**Files**
- `src/apps/registry.tsx` — `AppDef` interface (currently lines 15-21) and the
  `APP_REGISTRY` array (lines 23-87).
- `src/App.tsx` — `AppRoute()` (lines 25-31).
- `src/launcher/Launcher.tsx` — consumes registry; can use new `status` field for
  "coming soon" treatment on stubs.

**Steps**
1. Extend `AppDef` with:
   - `component: ComponentType` — the app's root component (import `ComponentType`
     from `react`).
   - `status: "functional" | "stub"` — drives launcher treatment; replaces the
     implicit "is it in the AppRoute if-chain" knowledge.
2. Populate `component` for each entry. Functional: `tasks` → `TasksApp`,
   `chicken-scratch` → `ChickenScratchApp`, `fraction-calculator` →
   `FractionCalculatorApp`. Stubs: `AppStubPage`. Mark `status` accordingly.
   - Use `React.lazy(() => import(...))` per app component so TipTap (DohDocs) and
     the Gemini path (Chicken Scratch) stay out of the launcher's initial bundle.
     Wrap the rendered component in `<Suspense fallback={...}>` in `AppRoute`.
3. Collapse `AppRoute()` to a lookup:
   `const def = getAppDef(appId); const C = def?.component ?? AppStubPage; return <Suspense><C/></Suspense>;`
   Remove the `if (appId === ...)` chain and the now-unused direct imports in
   `App.tsx` (`TasksApp`, `ChickenScratchApp`, `FractionCalculatorApp`).
4. Optional launcher polish: render `status: "stub"` tiles with a muted
   "Coming soon" affordance instead of looking identical to functional apps.

**Acceptance**
- All three functional apps still load at `/dashboard/app/<id>`.
- A stub id still renders `AppStubPage`.
- Adding a hypothetical app now requires only a registry entry + component file.
- `npm run build` clean.

---

## PHASE 2 — Route-level access guard

**Problem.** `app_access` is only consulted in `src/launcher/Launcher.tsx` (tile
show/hide) and the admin panels — **not** in `App.tsx`'s `AppRoute`. A user who
types `/dashboard/app/tasks` directly bypasses the tile gate and the app shell
mounts. Data is still protected by RLS, but the app opens to someone who wasn't
granted it. This is the coarse "open-this-app" gate from `CLAUDE.md` not being
enforced on the route.

**Goal.** A user can only mount an app they have `app_access` for; unauthorized
navigation redirects back to the launcher with a clear, plain-language message
(per the UX mandate — tell them what to do, not just "denied").

**Files**
- `src/App.tsx` — `AppRoute()` (post-Phase-1 lookup form).
- `src/storage/db.ts` — reuse existing app-access read (Launcher already lists the
  user's granted app ids; find that function and reuse it — do **not** add a new
  Supabase call path).
- `src/auth/AuthContext.tsx` / `useAuthState.ts` — source of the authed user id.

**Steps**
1. Determine how the Launcher gets the user's granted app ids (grep `app_access` in
   `db.ts` and `Launcher.tsx`). Reuse that exact read.
2. In `AppRoute` (or a small `<RequireAppAccess appId={...}>` wrapper), check the
   authed user's granted ids against `appId`. Admins (`profile.role === "admin"`)
   bypass — they can already reach everything via admin.
3. While the access list is loading, show a brief loading state (don't flash the
   app). On "no access", `<Navigate to="/dashboard" replace />` plus a toast/inline
   notice: "You don't have access to <App>. Ask your admin to grant it."
4. Decide whether stubs require access. Recommendation: stubs are harmless
   placeholders — gate them the same way for consistency, or exempt `status: "stub"`.
   Pick one and note it in a code comment.

**Acceptance**
- A non-admin without `tasks` access who navigates to `/dashboard/app/tasks` is
  redirected to the launcher with a clear message.
- A granted user loads the app normally; no loading-flash of the app shell.
- Admins reach any app.
- `npm run build` clean.

**Risk note.** Auth-adjacent. Test both granted and ungranted paths with the dev
auth bypass (`.claude/context/dohdash.md` → "Dev auth bypass & browser testing").

---

## PHASE 3 — Split `db.ts` by domain

**Problem.** `src/storage/db.ts` is ~880 lines and grows with every functional app.
It's a merge-conflict magnet and hard to navigate.

**Goal.** One client, one folder — many domain files. The invariant "never import
`supabase` outside `src/storage/`" is unchanged.

**Files (target shape)**
- `src/storage/client.ts` — the single `supabase` client + shared row↔domain
  mappers + shared types currently at the top of `db.ts`.
- `src/storage/notes.ts` — docs/folders CRUD (`listDocs`, `getDoc`, `saveDoc`, …).
- `src/storage/shares.ts` — `note_shares` / `folder_shares` + `searchShareTargets`.
- `src/storage/comments.ts` — `doc_comments` CRUD.
- `src/storage/groups.ts` — groups + members.
- `src/storage/admin.ts` — provisioning/audit/activity RPCs.
- `src/storage/appAccess.ts` — `app_access` reads/writes.
- Keep `src/storage/realtime.ts` as-is (it shares the client; point its import at
  `client.ts`).
- **Re-export everything from `src/storage/db.ts`** (`export * from "./notes"` etc.)
  so existing imports (`from "../../storage/db"`) keep working — zero churn in
  consumers. This makes the split a pure move + barrel, low-risk.

**Steps**
1. Create `client.ts` with the client + shared types/mappers. Everything else
   imports the client from here.
2. Move each domain's functions into its file, fixing imports. Don't change
   signatures or behavior.
3. Turn `db.ts` into a barrel that re-exports the domain modules.
4. Build; fix any type errors from the move. No consumer edits expected.
5. Update `.claude/context/dohdash.md` "Storage constraint" section to describe the
   folder layout (the rule is now "src/storage/ only", not "db.ts only").

**Acceptance**
- No import changes needed in `src/**` outside `src/storage/`.
- `npm run build` clean; app behaves identically (smoke-test DohDocs + Chicken
  Scratch + admin).

---

## PHASE 4 — Existing-app polish

Independent of Phases 1–3; can be done in any order. Each item is small.

### 4a. DohDocs save-state / offline indicator
**Why.** Auto-save fires every 400ms to Supabase (`Editor.tsx`). Field users on
poor connectivity get silent save failures. They need to *see* their work is safe.
**Files.** `src/apps/tasks/components/Editor.tsx` (the `saveDoc()` debounce);
`TasksApp.css` for the indicator (confirm where editor styles live — sidebar
styles live in `TasksApp.css` per docs; there is no `Sidebar.css`).
**Steps.**
1. Track save status: `idle | saving | saved | error`.
2. Show an unobtrusive indicator near the doc title: "Saving…" → "Saved" →
   "Offline — will retry" on failure.
3. On save failure, retry with backoff; keep the latest markdown in `localStorage`
   keyed by doc id so a refresh doesn't lose unsaved edits. Restore-on-open if the
   local copy is newer than the server `updated_at`.
**Acceptance.** Throttle/offline in devtools → indicator shows "Offline — will
retry", edits aren't lost across refresh, recovers when back online.

### 4b. DohDocs mobile/touch pass
**Why.** Most likely used on a phone in the field; checkbox-roster pattern is
touch-right but layout needs verifying at ~375px.
**Files.** `src/apps/tasks/TasksApp.css`, `Toolbar.tsx`, `SharePanel.tsx`,
`CommentsPanel.tsx`, `FolderShareModal.tsx`.
**Steps.** Audit at 375px width: toolbar wraps/scrolls (not clipped); share roster
+ comments panel are full-width/usable; tap targets ≥ 44px; sidebar collapses.
**Acceptance.** DohDocs is fully operable at 375px — open doc, edit, tag a user,
share, comment.

### 4c. Fraction Calculator — persist history
**Why.** History is session-only (`.claude/context/fraction-calculator.md`). A
trades user wants yesterday's cut-list numbers. Prefs already persist to
`localStorage`.
**Files.** `src/apps/fraction-calculator/FractionCalculatorApp.tsx` (reducer +
the existing `dohdash-fraction-calculator-prefs` persistence).
**Steps.** Persist `history` to `localStorage` (own key, e.g.
`dohdash-fraction-calculator-history`); cap length (e.g. last 50) to bound size;
restore on load; add a visible "Clear history" control (confirm before clearing).
**Acceptance.** History survives reload; capped; clearable with confirmation.

---

## Suggested order

Phase 1 → 2 (they compose: the guard slots into the Phase-1 lookup) → 3 (pure
refactor, safe anytime) → 4 (independent polish). Phases 1–3 are the best
candidate for a future supervised/PR-based autonomous run because each has a clear
build-and-test gate; Phase 4b (visual) benefits from a human eye.
