# DohDash — Claude Context
## Claude context Maintenance
When things change relevant to claude context reccomend updating the claude.md with the new information 

## Token Discipline & Diff Constraints
- **Diff-Only Output:** You must provide all code modifications strictly as standard unified diffs or targeted function replacements. Do not rewrite unaffected code block blocks, surrounding boilerplate, or entire files.
- **Strict Context Limitation:** Do not execute global repository searches (`grep`, `find`) or read files outside the explicitly targeted paths unless absolutely critical to resolve a compilation dependency.
- **Console Output Discipline:** When running build or test terminal commands, only output lines containing errors or warnings. Suppress verbose success logs.

## Model selection

**Proactively recommend a model switch at the start of your response when the task clearly fits.** One sentence, e.g. "This is a good candidate for Opus — complex RLS + multi-file refactor." or "Haiku would handle this fine and save tokens." Don't recommend switching for ambiguous tasks; only flag clear fits.

| Switch to… | When the task is… |
|---|---|
| **Opus 4.8** (`claude-opus-4-8`) | New DB schema + RLS design; multi-file architectural refactor (5+ interdependent files); auth/tenancy correctness reasoning; debugging non-deterministic/race-condition bugs; any task where a wrong answer causes data loss or a security hole |
| **Haiku 4.5** (`claude-haiku-4-5-20251001`) | Generating boilerplate from an established pattern; large read-only research sessions |
| **Sonnet 4.6** (stay) | Everything else — everyday feature work, adding a field, writing a storage function, standard 1–3 file bug fixes |

To switch mid-conversation: type `/model claude-opus-4-8` (or the target model id) in the chat. Context carries over.

## Project overview

DohDash is a "company OS" dashboard: employees sign in (Google OAuth via Supabase Auth) to a launcher of company apps, gated by admin-controlled per-app permissions. Also serves a public landing page. **Portable to another company** by swapping `public/CompanyInfo.md` (+ logo + Supabase credentials) — no source edits, no rebuild.

Apps (`APP_REGISTRY`, `src/apps/registry.tsx`): Job Files, Tasks (a.k.a. DohDocs), Calendar, Contacts, Time Tracker, Time Dashboard, Expense Tracker, Clean Up, Chicken Scratch. **Functional: Tasks/DohDocs + Chicken Scratch + Time Tracker + Time Dashboard. The rest are stubs.** `resolveAppName()` lets `CompanyInfo.md`'s `appNames` map rename an app per-deployment (that's how "Tasks" displays as "DohDocs").

> **Jobs-app note:** When the Job Files / Jobs app is built, the Time Tracker job-tag dropdown must source jobs from it, replacing the interim `time_jobs` table. Keep `job_label` denormalized on `time_entries` — no migration needed at that point. See `.claude/context/time-tracking.md`.

## UX mandate — built for non-technical users

**DohDash and every app in it are operated by non-technical, field-based users (construction/trades staff), not engineers.** This is a hard product constraint, not a nice-to-have. When building or changing any UI:

- **Favor recognition over recall.** Don't make users type what they could pick. Prefer checkbox/select lists, toggles, and clickable rows over free-text fields that require knowing an exact name, email, ID, or syntax. (Example: group membership is a checkbox roster of all users with a filter box — not a type-the-email search.)
- **No hidden knowledge.** Never require users to know Markdown, query syntax, IDs, or keyboard-only affordances. Every action should be discoverable through visible controls with plain-language labels.
- **Plain language, short labels.** Avoid jargon ("provision", "RLS", "grantee"). Say what the button does.
- **Forgiving + obvious state.** Confirm destructive actions, show what's selected/checked, and make the next step clear. Empty states should say what to do, not just "nothing here".
- **Sensible defaults.** Pre-fill and pre-select the common choice so the happy path is one or two clicks.
- **Mobile layout required.** DohDash is used heavily on phones. Every new app and feature MUST include `@media (max-width: 720px)` breakpoints in its co-located CSS. Fixed-width two-column layouts (sidebar + content) must stack to single-column on mobile. Horizontal scrolling (like the shell nav or format ribbon) is acceptable for navigation strips; content areas must be full-width. Not adding mobile CSS is a bug, not a "later" task.

When a flow feels like it needs a tutorial, redesign it. If unsure whether something is friendly enough, assume the user has never used a similar app. Visual/token rules live in `styleguide.md`; this section is about interaction design.

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
- **Multi-tenant**: one deployment + one Supabase project serve all customers via a `tenants` table; Doh Built (`slug='built'`) is tenant #1. **Every new tenant-owned table MUST get a `tenant_id uuid not null default current_tenant_id()` column and AND `tenant_id = current_tenant_id()` into every RLS policy** (`scratch_cache` is the one documented global exception). Tenant is resolved from hostname; per-tenant branding lives in `tenants.config` (so `CompanyInfo.md` is now only a seed template). Full detail: `dohdash.md`.
- **Per-component CSS**: every `.tsx` imports a co-located `.css` consuming the CompanyInfo-driven CSS custom properties on `:root`. Tokens + dark-mode mechanism: `styleguide.md`.

## CompanyInfo.md — portability

Typed `CompanyInfo` (`src/company/types.ts`) drives all branding. **Since multi-tenancy, the live config comes from `tenants.config` (a jsonb column) resolved by hostname via the anon RPC `get_tenant_public_config`, not from `public/CompanyInfo.md`** — that file is now just the **seed template** for tenant #1. `loadCompanyInfo()` calls the RPC; `applyCompanyTheme()` writes `styleGuide` as CSS vars; `CompanyInfoContext` exposes `companyName`/`dashboardName`/`adminContact`/`logo`/`appNames` (+ `notFound` for an unrecognized host). See `dohdash.md` → Multi-tenancy.

**To onboard a new tenant** (multi-tenant model): insert a `tenants` row (slug + `config` JSON in the `CompanyInfo` shape) and provision its first admin; set up the subdomain/custom-domain + OAuth redirect. No source edits, no rebuild. (Single-tenant porting to a *separate* Supabase project — swap `CompanyInfo.md` seed + `.env`/Vercel vars + `supabase db push` — still works for a standalone fork.)

## Project skills & agents

Project-specific helpers live in `.claude/skills/` and `.claude/agents/` — read
their frontmatter for what each does and how to invoke (skills via `/<name>`,
agents by name). Two cross-cutting rules that aren't visible in any single file:

- **Review is hybrid:** reach for the `dohdash-review` agent when a diff touches tenancy/RLS/migrations, the `src/storage` layer, styling, or user-facing pickers; use `/code-review` for general logic/correctness; both when a change spans both; neither for tiny/doc changes.
- **Commits/pushes are manual** (a push auto-deploys live to Vercel) — see `/commit-and-push`; never commit or push without explicit per-change approval.

## Dev workflow

- `npm run dev` — dev server at `localhost:5173` (next free port if taken)
- `npm run build` — `tsc -b` typecheck, then Vite build to `dist/`
- `.env.local` (gitignored) needs `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
- **Config/env files:** create them directly with the Write tool (pre-filling any known values) rather than instructing terminal commands — never ask the user to copy/paste into a terminal.

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

- update app-level context when major changes are made

@public/CompanyInfo.md
@.claude/context/styleguide.md
@.claude/context/dohdash.md
@.claude/context/operator-control-plane.md
@.claude/context/tasks.md
@.claude/context/chicken-scratch.md
@.claude/context/fraction-calculator.md
@.claude/context/remote-claude.md
@.claude/context/time-tracking.md
@.claude/context/personal-assistant.md
@.claude/context/operator-assistant.md
@.claude/context/operator-journal.md
