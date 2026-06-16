# DohDash Shell — Context

## Auth state machine

`src/auth/useAuthState.ts` — a single `supabase.auth.onAuthStateChange` subscription drives all auth state. Never call `getSession()` separately (race condition). `deriveAuthState(session, outcome)` is pure — unit-testable without React or Supabase.

```ts
type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "pending-access"; session: Session }
  | { status: "authenticated"; session: Session; profile: Profile }
  | { status: "error"; message: string }
```

- **`pending-access` vs `error` is intentional:** `getProfile` returns `null` only on Postgres `PGRST116` (no row) → `pending-access`. Any other failure throws → `error` with retry button. Never silently mislabeled.
- `profileState` is tagged with `userId` so a stale fetch from a sign-out/sign-back-in race can't corrupt the current user's state.

## Routing

`src/App.tsx` — `BrowserRouter`; `AuthGate` is a layout route guarding `/dashboard/*`. After the OAuth round-trip, `REDIRECT_STORAGE_KEY` (`dohdash:redirect` in `sessionStorage`) restores the original deep-link destination.

## Admin panel

`src/admin/` — `AdminDashboard.tsx` (4 tabs: Users / App Access / `AppAccessPanel.tsx` / Activity / `ActivityPanel.tsx` / Groups / `GroupsPanel.tsx`).

**Provisioning (email pre-authorization):**
1. Admin enters email → `provisionUserByEmail()` → `admin_provision_user` RPC
2. Not signed in yet → row lands in `pending_profiles`; `handle_new_user` trigger on `auth.users` INSERT promotes it to `profiles` on first sign-in
3. Already signed in → goes straight to `profiles`

**Self-service onboarding:** a user hitting the pending gate (`PendingAccessPage`) writes to `access_requests`; admin accepts (`admin_accept_access_request` RPC) or rejects.

**User removal:** `admin_remove_user` RPC deletes the `auth.users` row (cascades to profiles/app_access/access_requests) but keeps their docs (`owner_id` → null); rejects self-removal so ≥1 admin always remains.

**Activity:** `admin_list_user_activity` RPC → last-sign-in per user.

**Audit log** (`admin_audit_log`, `AuditAction` union): dual-write — direct-table actions (grant/revoke app access, role change, reject, cancel pending) log client-side via `logAdminAction`; RPC-backed actions (provision, accept, remove) log inside SQL.

`is_admin()` is a `SECURITY DEFINER` function — avoids RLS self-referential recursion from a plain `exists (select ... from profiles where role = 'admin')` policy on `profiles` itself.

## CompanyInfo portability

`src/company/companyInfo.ts` — `loadCompanyInfo()` fetches `/CompanyInfo.md` at runtime; `applyCompanyTheme()` writes `styleGuide` as CSS vars on `document.documentElement` (token list: `styleguide.md`). `CompanyInfoContext` exposes `companyName`, `dashboardName`, `adminContact`, `logo`, `appNames`. `data-theme` on `<html>` toggles light/dark via `src/theme.ts` (localStorage + `prefers-color-scheme`). To port: see `CLAUDE.md`.

## Storage constraint

**All Supabase DB calls go through `src/storage/db.ts` only.** Permitted exceptions: `supabase.auth` in `useAuthState.ts`, `supabase.functions.invoke` in Chicken Scratch, and `src/storage/realtime.ts` (Realtime broadcast for DohDocs presence/live-refresh — shares db.ts's client; components use its typed subscribe helpers, never supabase directly).

Tables: `profiles`, `app_access`, `pending_profiles`, `access_requests`, `admin_audit_log`, `notes`, `folders`, `doc_comments`, `groups`, `group_members`, `note_shares`, `folder_shares`.

`app_id` is a code-defined string key into `APP_REGISTRY` (`src/apps/registry.tsx`) — apps are not DB rows.

## Platform Groups

Admin-managed groups (`groups` + `group_members` tables) live at the DohDash shell level so any app can use them for sharing.

- **SELECT** on both tables: any authenticated user (needed for share-target search)
- **INSERT/UPDATE/DELETE**: `is_admin()` only; `group_members` has no UPDATE policy (add/remove only)
- `db.ts` exports: `listGroups`, `createGroup`, `updateGroup`, `deleteGroup`, `listGroupMembers`, `addGroupMember`, `removeGroupMember`, `listMyGroups`
- Admin UI: `src/admin/GroupsPanel.tsx` — left column list + right detail pane (editable name/description, member management with type-ahead, delete with confirmation)

## Dev auth bypass & browser testing

For local testing/troubleshooting, Claude can load DohDash already
`authenticated` (bypassing Google OAuth) using Playwright:

1. `.env.local` must have `SUPABASE_SERVICE_ROLE_KEY` (service_role secret,
   Project Settings -> API in Supabase). Only read by scripts in `scripts/`
   via `--env-file`; never imported by `src/`.
2. `npm run auth:mint` mints a session for the admin test user
   (`yeg.built.form@gmail.com`) via `generateLink`/`verifyOtp` and writes
   `playwright/.auth/admin.json` (Playwright storageState, gitignored).
   Uses the `email_otp` from `generateLink`, not `hashed_token` — this
   project's GoTrue rejects `hashed_token` as immediately expired.
3. With `npm run dev` running, write a one-off script under `scripts/dev/`
   that launches Chromium with `storageState: "playwright/.auth/admin.json"`
   to land on `/dashboard` pre-authenticated — see
   `scripts/dev/check-dashboard.mjs` for the pattern.
4. OAuth troubleshooting: a session-loaded context exercises post-redirect
   states (`pending-access`/`error`/profile provisioning, see
   `useAuthState.ts`); a fresh context with no `storageState` clicking
   "Sign in with Google" reveals pre-redirect config issues (redirect URI
   mismatch) without real Google credentials.

Re-run `npm run auth:mint` if the session expires or is rotated.
