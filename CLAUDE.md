# DohDash — Claude Context

## Project overview

DohDash is a "company OS" dashboard: employees sign in (Google OAuth via Supabase Auth) to a launcher of company apps, gated by admin-controlled per-app permissions. Also serves a public landing page. **Portable to another company** by swapping `public/CompanyInfo.md` (+ logo + Supabase credentials) — no source edits, no rebuild.

Apps (`APP_REGISTRY`, `src/apps/registry.tsx`): Job Files, Tasks (a.k.a. DohDocs), Calendar, Contacts, Time Tracker, Expense Tracker, Clean Up, Chicken Scratch. **Functional: Tasks/DohDocs + Chicken Scratch. The rest are stubs.** `resolveAppName()` lets `CompanyInfo.md`'s `appNames` map rename an app per-deployment (that's how "Tasks" displays as "DohDocs").

## Tech stack

- React 19 + TypeScript 6 + Vite 8 (rolldown-based)
- `react-router-dom` 7 — `BrowserRouter`, nested routes, `AuthGate` layout route guarding `/dashboard/*`
- `@supabase/supabase-js` — Postgres + Auth (Google OAuth) + RLS
- `gray-matter` — parses `CompanyInfo.md` YAML frontmatter
- Vercel — static hosting, GitHub auto-deploy, SPA fallback via `vercel.json` rewrites

## Key architecture

- **All Supabase access is isolated in `src/storage/db.ts`** — single exported client, domain types, row↔domain mappers, flat async CRUD. Never add Supabase calls elsewhere. Permitted exceptions only: `supabase.auth` in `useAuthState.ts`, `supabase.functions.invoke` in Chicken Scratch, and `src/storage/realtime.ts` (shares db.ts's client). Detail + table list: `dohdash.md`.
- **Credentials are env vars** (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in gitignored `.env.local`) — what makes porting source-free.
- **Auth is a discriminated-union state machine** in `src/auth/useAuthState.ts`. Full type + the `pending-access` vs `error` distinction: `dohdash.md`.
- **User provisioning is email pre-authorization** — admin grants by email before first sign-in; flow + `pending_profiles` trigger detail: `dohdash.md`.
- **App permissions**: `app_access (user_id, app_id, granted_by, created_at)` is the coarse open-this-app gate. `app_id` is a string key into the code-defined `APP_REGISTRY` — apps are not DB rows.
- **Per-component CSS**: every `.tsx` imports a co-located `.css` consuming the CompanyInfo-driven CSS custom properties on `:root`. Tokens + dark-mode mechanism: `styleguide.md`.

## CompanyInfo.md — portability

`public/CompanyInfo.md` is fetched **at runtime** (`fetch("/CompanyInfo.md")`, never bundled) and parsed via `gray-matter` into typed `CompanyInfo` (`src/company/types.ts`). `applyCompanyTheme()` writes `styleGuide` as CSS vars; `CompanyInfoContext` exposes `companyName`/`dashboardName`/`adminContact`/`logo`/`appNames`.

**To port:** (1) swap `public/CompanyInfo.md` + its `logo` file; (2) point `.env.local` / Vercel env vars at a different Supabase project; (3) `supabase db push` the migrations. No source edits, no rebuild. `CLAUDE.md` and `PRODUCT.md` travel with the source and are *not* part of the swap.

## Dev workflow

- `npm run dev` — dev server at `localhost:5173` (next free port if taken)
- `npm run build` — `tsc -b` typecheck, then Vite build to `dist/`
- `.env.local` (gitignored) needs `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`

## Deploy workflow

**NEVER `git commit` or `git push` without explicit user approval for that specific deploy** — a push triggers a live Vercel auto-deploy with no further confirmation.

- `vercel.json` rewrites all routes to `/index.html` (without it, refreshing `/dashboard/admin` 404s)
- Build command + output dir (`dist`) auto-detected by Vercel's Vite preset
- Vercel env vars must mirror `.env.local`

## Supabase

- Project URL: `https://awytndrcppmevaguyikg.supabase.co`
- Google OAuth redirect URL must be registered in **both** Google Cloud Console and Supabase Auth settings, per environment (`http://localhost:5173` dev, Vercel domain prod)
- Migrations source-controlled in `supabase/migrations/*.sql`, applied via `supabase db push`
- RLS enabled on `profiles`, `app_access`, `pending_profiles` (and later tables). `is_admin()` is a `SECURITY DEFINER` helper avoiding self-referential-policy recursion — see `dohdash.md`.

## App-level context

@public/CompanyInfo.md
@.claude/context/styleguide.md
@.claude/context/dohdash.md
@.claude/context/tasks.md
@.claude/context/chicken-scratch.md
