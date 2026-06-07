# DohDash — Claude Context

## Project overview

DohDash is a "company OS" dashboard: a portal employees sign into (Google OAuth via Supabase Auth) to reach a launcher of company apps — Job Files, Tasks, Calendar, Contacts, Time Tracker, Expense Tracker, Clean Up (placeholder stubs in v1) — gated by admin-controlled per-app permissions. It also serves a public landing page, and is built to be **portable to a different company** by swapping `public/CompanyInfo.md` (+ logo + Supabase credentials) — no source edits, no rebuild.

## Tech stack

- React 19 + TypeScript 6 + Vite 8 (rolldown-based)
- `react-router-dom` 7 — `BrowserRouter`, nested routes, `AuthGate` as a layout route guarding `/dashboard/*`
- `@supabase/supabase-js` — Postgres + Auth (Google OAuth) + Row Level Security
- `gray-matter` — parses `CompanyInfo.md`'s YAML frontmatter
- Netlify — static hosting, GitHub auto-deploy, SPA fallback via `public/_redirects`

## Key architecture

- **All persistence is isolated in `src/storage/db.ts`** — the only file that talks to Supabase. Never add API calls elsewhere. It exports a single `supabase` client (env-var based, see below), the domain types (`Profile`, `AppAccessGrant`, `PendingProfile`, `Role`), row↔domain mappers, and flat async CRUD functions everything else calls.
- **Supabase credentials are env vars, not hardcoded**: `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env.local` (gitignored). This is what makes porting "swap credentials, no source edits" — see Porting below.
- **Auth is a fresh-built discriminated-union state machine**, not a pile of independent booleans. `src/auth/useAuthState.ts` subscribes once to `supabase.auth.onAuthStateChange` and reduces every event into one `AuthState` via the pure, unit-testable `deriveAuthState`:
  ```ts
  type AuthState =
    | { status: "loading" }
    | { status: "signed-out" }
    | { status: "pending-access"; session: Session }
    | { status: "authenticated"; session: Session; profile: Profile }
    | { status: "error"; message: string };
  ```
  `pending-access` ("you signed in but no admin has granted you access yet") and `error` ("we couldn't tell — try again") are deliberately distinct: `getProfile` in `db.ts` returns `null` only on Postgres `PGRST116` ("no row found"); any other failure (network, RLS, timeout) throws and surfaces as `error` with a retry button — never silently mislabeled as pending-access.
- **User provisioning is "email pre-authorization"**: an admin grants access by email *before* the person ever signs in (Admin → Users tab → "Grant access", which calls `provisionUserByEmail` → the `admin_provision_user` RPC). Because `profiles.id` is a foreign key to `auth.users.id` — a UUID that doesn't exist until someone actually signs in — grants for not-yet-registered emails land in a `pending_profiles` table; a `handle_new_user` trigger on `auth.users` promotes the pending row into a real `profiles` row the instant that person first signs in with Google. See `supabase/migrations/0003_pending_profiles.sql`.
- **App-level permissions**: `app_access (user_id, app_id, granted_by, created_at)` is the coarse "can this person open this app" gate. `app_id` is a string key into the code-defined `APP_REGISTRY` (`src/apps/registry.ts`) — apps are not DB rows, since every v1 app is a stub. A future `app_resource_access` table could layer finer per-app permissions (e.g. folders within Job Files) on top of this purely additively, without touching `app_access`.
- **Per-component CSS**: every `.tsx` imports its own co-located `.css` (e.g. `Shell.tsx` + `Shell.css`). All of them consume the CompanyInfo-driven CSS custom properties written onto `:root` — `--bg`, `--bg-alt`, `--border`, `--text`, `--muted`, `--accent`, `--accent-soft` (plus `dark-*` variants), `--font-display/-heading/-body` + `--font-weight-*`, `--rounded-sm/md/lg`, `--spacing-xs/sm/md/lg/xl` — alongside the light/dark `data-theme` mechanism in `src/theme.ts` (localStorage + `prefers-color-scheme`).

## CompanyInfo.md — the portability mechanism

`public/CompanyInfo.md` is fetched **at runtime** (`fetch("/CompanyInfo.md")`, never bundled at build time) and parsed via `gray-matter` into a typed `CompanyInfo` (`src/company/types.ts`). `loadCompanyInfo()` / `applyCompanyTheme()` (`src/company/companyInfo.ts`) write its `styleGuide` as CSS custom properties on `document.documentElement`; `CompanyInfoContext` makes `companyName` / `dashboardName` / `adminContact` / `logo` available everywhere without prop drilling.

### Porting to a new company

1. Replace `public/CompanyInfo.md` (same YAML-frontmatter-plus-Markdown-body shape: `companyName`, `dashboardName`, `adminContact`, `logo`, `styleGuide`) and whatever file `logo` points to (default `public/company-logo.svg`).
2. Point credentials at a different Supabase project: `.env.local` locally, Netlify site env vars when deployed (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
3. Apply `supabase/migrations/*.sql` to that project (`supabase db push`).
4. Done — no source edits, no rebuild for the branding swap; it's fetched at runtime.

This file and `PRODUCT.md` are **not** part of that swap. They travel with the source and describe the app itself — `CompanyInfo.md` is the only thing that changes per deployment.

## Dev workflow

- `npm run dev` — dev server at `localhost:5173` (Vite picks the next free port if it's taken)
- `npm run build` — `tsc -b` typecheck, then Vite build to `dist/`
- `.env.local` (gitignored) needs `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`

## Deploy workflow

**NEVER run `git commit` or `git push` without explicit user approval for that specific deploy.** Always stop and ask first — a push triggers a Netlify auto-deploy and goes live immediately, with no further confirmation.

- `netlify.toml`: `npm run build` → publish `dist/`
- `public/_redirects` (`/* /index.html 200`) is required — without it, refreshing a deep link like `/dashboard/admin` 404s
- Netlify site env vars must mirror `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Supabase

- Project URL: `https://awytndrcppmevaguyikg.supabase.co`
- Auth: Google OAuth — the redirect URL must be registered in **both** the Google Cloud Console and the Supabase Auth provider settings, for every environment (`http://localhost:5173` in dev, the Netlify domain in production)
- Migrations are source-controlled in `supabase/migrations/*.sql`, applied via `supabase db push`
- RLS is enabled on `profiles`, `app_access`, and `pending_profiles`; `is_admin()` is a `SECURITY DEFINER` helper function that avoids the self-referential-policy recursion you'd get from a plain `exists (select ... from profiles where role = 'admin')` policy on `profiles` itself
