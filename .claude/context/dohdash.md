# DohDash Shell — Context

## Auth state machine

`src/auth/useAuthState.ts` — single `supabase.auth.onAuthStateChange` subscription drives all auth state. Never call `getSession()` separately (race condition).

```ts
type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "pending-access"; session: Session }
  | { status: "authenticated"; session: Session; profile: Profile }
  | { status: "error"; message: string }
```

`deriveAuthState(session, outcome)` is pure — unit-testable without React or Supabase wiring.

**`pending-access` vs `error` is intentional:** `getProfile` in `db.ts` returns `null` only on Postgres `PGRST116` (no row found) → `pending-access`. Any other failure throws → `error` with retry button. Never silently mislabeled as pending.

`profileState` is tagged with `userId` so a stale profile fetch from a sign-out/sign-back-in race can never corrupt the current user's state.

## Routing

`src/App.tsx` — `BrowserRouter` wraps the app. `AuthGate` is a layout route guarding `/dashboard/*`. After the OAuth round-trip, `REDIRECT_STORAGE_KEY` (`dohdash:redirect` in `sessionStorage`) restores the original deep-link destination.

## Admin panel

`src/apps/admin/` — user provisioning and app access management.

**Provisioning flow:**
1. Admin enters email → `provisionUserByEmail()` → `admin_provision_user` RPC
2. User hasn't signed in yet → row lands in `pending_profiles`
3. `handle_new_user` trigger on `auth.users` INSERT → promotes pending row to `profiles`
4. User already signed in → goes directly to `profiles`

`is_admin()` is a `SECURITY DEFINER` function — avoids RLS self-referential recursion from a plain `exists (select ... from profiles where role = 'admin')` policy on `profiles` itself.

## CompanyInfo portability

`src/company/companyInfo.ts` — `loadCompanyInfo()` fetches `/CompanyInfo.md` **at runtime** (never bundled at build time). `applyCompanyTheme()` writes its `styleGuide` fields as CSS custom properties to `document.documentElement`.

Available everywhere via `CompanyInfoContext`: `companyName`, `dashboardName`, `adminContact`, `logo`.

CSS vars written to `:root`: `--bg`, `--bg-alt`, `--border`, `--text`, `--muted`, `--accent`, `--accent-soft` (plus `dark-*` variants), `--font-display/-heading/-body`, `--font-weight-*`, `--rounded-sm/md/lg`, `--spacing-xs/sm/md/lg/xl`.

`data-theme` on `<html>` toggles light/dark — managed by `src/theme.ts` (localStorage + `prefers-color-scheme`).

**To port to a new company:** swap `public/CompanyInfo.md` + logo + `.env.local` Supabase credentials. No source edits, no rebuild.

## Storage constraint

**All Supabase DB calls must go through `src/storage/db.ts` only.** Permitted exceptions: `supabase.auth` in `useAuthState.ts`, `supabase.functions.invoke` in Chicken Scratch, and `src/storage/realtime.ts` (Realtime channels for DohDocs presence/live-refresh — shares db.ts's client; components use its typed subscribe helpers, never supabase directly). Never add direct Supabase calls in other components.

Tables: `profiles`, `app_access`, `pending_profiles`, `access_requests`, `admin_audit_log`, `notes`, `folders`, `doc_comments`.

`app_id` is a code-defined string key into `APP_REGISTRY` (`src/apps/registry.ts`) — apps are not DB rows.
