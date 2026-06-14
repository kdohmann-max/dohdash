# Playwright-based dev auth bypass & browser testing

## Problem

Claude can't drive DohDash past the Google OAuth screen (no real Google
credentials, 2FA/captcha, ToS concerns), which blocks both general "load the
app and look at it" testing and OAuth-related troubleshooting. The previous
plan relied on the AgentsRoom-Browser MCP, which is no longer in use.

## Goals

- Let Claude load DohDash already `authenticated` as an existing admin test
  account (`yeg.built.form@gmail.com`), without going through Google's UI.
- Give Claude a lightweight, repeatable way to drive the browser for
  exploratory testing and screenshots.
- Make it easier to reproduce/troubleshoot OAuth-adjacent states
  (`pending-access`, `error`, profile provisioning) and pre-redirect config
  issues (redirect URI / provider setup), without manual sign-ins.

## Non-goals

- Driving a real Google OAuth login (account creation, 2FA, consent screen
  interaction with real credentials).
- A persisted Playwright Test (`@playwright/test`) regression suite — may be
  a future iteration if specific flows prove worth locking down.
- Handling long-lived/refreshed sessions across days — re-minting is cheap.

## Design

### 1. Service role key

Add `SUPABASE_SERVICE_ROLE_KEY=<value>` to `.env.local` (already covered by
the `*.local` gitignore pattern). This key is only ever read by Node scripts
under `scripts/`, run directly via `node --env-file=.env.local`. It is never
imported by `src/` and, being unprefixed (not `VITE_`), Vite will never
expose it to the client bundle.

### 2. Session minting script — `scripts/mint-session.mjs`

Run via `npm run auth:mint` (`node --env-file=.env.local scripts/mint-session.mjs`).

1. Create an admin Supabase client using `VITE_SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`.
2. Call `admin.generateLink({ type: 'magiclink', email: 'yeg.built.form@gmail.com' })`
   to get a `token_hash` — this does **not** send an email, it just generates
   a verifiable token.
3. Create a plain (anon-key) Supabase client and call
   `auth.verifyOtp({ email, token: token_hash, type: 'magiclink' })` to
   exchange it for a real `Session` (access token, refresh token, user).
4. Derive the project ref from `VITE_SUPABASE_URL`
   (`https://<ref>.supabase.co`) and write a Playwright `storageState` JSON
   to `playwright/.auth/admin.json`:

```json
{
  "cookies": [],
  "origins": [
    {
      "origin": "http://localhost:5173",
      "localStorage": [
        { "name": "sb-<ref>-auth-token", "value": "<JSON.stringify(session)>" }
      ]
    }
  ]
}
```

Any Playwright context created with `storageState: 'playwright/.auth/admin.json'`
will load DohDash already `authenticated` as the admin test user — the
Supabase JS client picks up the stored session on init and auto-refreshes
the access token as needed via the refresh token.

If a script run fails because the session has expired/been rotated, just
re-run `npm run auth:mint`.

**Port assumption:** the storage state's `origin` must match the dev server
URL. `npm run dev` defaults to `http://localhost:5173` but Vite falls back to
the next free port if 5173 is taken. If a Playwright script can't find the
authenticated dashboard, check the actual dev server port first.

### 3. Browser-driving pattern

- Add `playwright` as a devDependency; one-time `npx playwright install chromium`.
- For each task, Claude writes a small one-off script under `scripts/dev/`
  (e.g. `scripts/dev/check-dashboard.mjs`) that:
  - `chromium.launch()`
  - `browser.newContext({ storageState: 'playwright/.auth/admin.json' })`
    (omit `storageState` for signed-out scenarios)
  - navigates to the relevant `http://localhost:5173/...` route (assumes
    `npm run dev` is already running)
  - captures what's needed: `page.screenshot({ path: 'playwright/output/...png' })`,
    `page.on('console', ...)`, `page.on('response', ...)`
  - prints a terse summary to stdout (per the project's console-output rule —
    errors/warnings only)
  - closes the browser

These scripts are throwaway/per-task, not a maintained suite.

### 4. OAuth troubleshooting workflows

- **Post-redirect states** (`pending-access`, `error`, profile provisioning
  via `handle_new_user`): load `/dashboard` with the minted admin session (or
  a session for a user without a `profiles` row, if that scenario is needed
  later) and inspect which `AuthState` renders plus any console errors. This
  exercises `deriveAuthState` without touching Google at all.
- **Pre-redirect / config issues** (redirect URI mismatch, provider
  misconfiguration): fresh context with **no** `storageState`, click "Sign in
  with Google", and observe where the browser lands (Google consent screen vs.
  an immediate error) and any failed network requests — reveals config
  problems without real Google credentials.

### 5. Housekeeping

- `.gitignore`: add `playwright/.auth/` and `playwright/output/`.
- Document this workflow briefly in `.claude/context/dohdash.md` so future
  Claude sessions know it exists and how to use it.

## Testing / verification

- Run `npm run auth:mint` and confirm `playwright/.auth/admin.json` is
  created with a non-empty `localStorage` entry.
- Run a sample `scripts/dev/check-dashboard.mjs` against a running
  `npm run dev` and confirm the screenshot shows the authenticated dashboard
  (not the sign-in page).
