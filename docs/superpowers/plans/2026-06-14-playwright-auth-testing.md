# Playwright Dev Auth Bypass & Browser Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Claude load DohDash already `authenticated` as an existing admin
test account (bypassing Google OAuth), and drive the browser with Playwright
for exploratory testing and OAuth-state troubleshooting.

**Architecture:** A Node script (`scripts/mint-session.mjs`) uses the Supabase
service-role key to mint a real session for `yeg.built.form@gmail.com` and
writes it as a Playwright `storageState` file. Ad-hoc Playwright scripts under
`scripts/dev/` load that storage state to launch Chromium pre-authenticated
against the local dev server.

**Tech Stack:** Node 24 (`--env-file`), `@supabase/supabase-js` (already a
dependency), `playwright` (new devDependency).

**Spec:** `docs/superpowers/specs/2026-06-14-playwright-auth-testing-design.md`

---

## Prerequisite (manual, user-side)

Before Task 3's test step will pass, `.env.local` must contain
`SUPABASE_SERVICE_ROLE_KEY=<the project's service_role secret>` (from the
Supabase dashboard: Project Settings -> API). The user said they'll add this
themselves. If it's missing when you reach Task 3's test step, pause and ask
the user to add it, then continue.

---

### Task 1: Gitignore Playwright auth/output artifacts

**Files:**
- Modify: `.gitignore`

- [x] **Step 1: Add ignore patterns**

Append a new section at the end of `.gitignore`:

```gitignore

# Playwright dev auth/test artifacts
playwright/.auth/
playwright/output/
```

- [x] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "Ignore Playwright dev auth/output artifacts"
```

---

### Task 2: Add Playwright devDependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (auto-updated by npm)

- [x] **Step 1: Install Playwright**

Run: `npm install -D playwright`

Expected: `package.json` gains `"playwright": "^<version>"` under
`devDependencies`, `package-lock.json` updates.

- [x] **Step 2: Install the Chromium browser binary**

Run: `npx playwright install chromium`

Expected: downloads Chromium for Playwright (one-time, cached outside the repo).

- [x] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add playwright devDependency for dev auth testing"
```

---

### Task 3: Session-minting script

**Files:**
- Create: `scripts/mint-session.mjs`
- Modify: `package.json` (add `auth:mint` script)

- [x] **Step 1: Write `scripts/mint-session.mjs`**

```js
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const TEST_USER_EMAIL = "yeg.built.form@gmail.com";
const DEV_SERVER_ORIGIN = "http://localhost:5173";
const OUTPUT_PATH = "playwright/.auth/admin.json";

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  console.error(
    "Missing required env vars. Need VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, " +
      "and SUPABASE_SERVICE_ROLE_KEY in .env.local (run with --env-file=.env.local)."
  );
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
  type: "magiclink",
  email: TEST_USER_EMAIL,
});

if (linkError) {
  console.error("generateLink failed:", linkError.message);
  process.exit(1);
}

const tokenHash = linkData.properties.hashed_token;

const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: verifyData, error: verifyError } = await anonClient.auth.verifyOtp({
  email: TEST_USER_EMAIL,
  token: tokenHash,
  type: "magiclink",
});

if (verifyError) {
  console.error("verifyOtp failed:", verifyError.message);
  process.exit(1);
}

const session = verifyData.session;
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const storageKey = `sb-${projectRef}-auth-token`;

const storageState = {
  cookies: [],
  origins: [
    {
      origin: DEV_SERVER_ORIGIN,
      localStorage: [{ name: storageKey, value: JSON.stringify(session) }],
    },
  ],
};

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, JSON.stringify(storageState, null, 2));
console.log(`Wrote session for ${TEST_USER_EMAIL} to ${OUTPUT_PATH}`);
```

> **Note (actual implementation):** `hashed_token` was rejected by this
> project's GoTrue as immediately expired. The committed script uses
> `linkData.properties.email_otp` instead, with an inline comment explaining
> the deviation.

- [x] **Step 2: Add the `auth:mint` npm script**

In `package.json`, under `"scripts"`, add:

```json
"auth:mint": "node --env-file=.env.local scripts/mint-session.mjs"
```

- [x] **Step 3: Run it**

Run: `npm run auth:mint`

Expected output: `Wrote session for yeg.built.form@gmail.com to playwright/.auth/admin.json`

If it fails with the missing-env-vars message, pause and ask the user to add
`SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (see Prerequisite above), then
re-run.

- [x] **Step 4: Verify the output file**

Check that `playwright/.auth/admin.json` exists and
`origins[0].localStorage[0].value` is a non-empty JSON string containing
`"access_token"`.

- [x] **Step 5: Commit**

```bash
git add scripts/mint-session.mjs package.json
git commit -m "Add session-minting script for dev auth bypass"
```

(Do not commit `playwright/.auth/admin.json` — it's gitignored from Task 1.)

---

### Task 4: Sample browser-driving script

**Files:**
- Create: `scripts/dev/check-dashboard.mjs`

- [x] **Step 1: Write `scripts/dev/check-dashboard.mjs`**

```js
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const DEV_SERVER_ORIGIN = "http://localhost:5173";
const STORAGE_STATE = "playwright/.auth/admin.json";
const OUTPUT_DIR = "playwright/output";

mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ storageState: STORAGE_STATE });
const page = await context.newPage();

const errors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
page.on("pageerror", (err) => errors.push(err.message));

await page.goto(`${DEV_SERVER_ORIGIN}/dashboard`);
await page.waitForLoadState("networkidle");

await page.screenshot({ path: `${OUTPUT_DIR}/dashboard.png`, fullPage: true });

const bodyText = await page.locator("body").innerText();
const signedOut = bodyText.includes("Sign in with Google");

console.log(signedOut ? "NOT authenticated: sign-in page shown" : "Authenticated: dashboard loaded");
for (const e of errors) console.error("Console error:", e);

await browser.close();
```

> **Note (actual implementation):** the committed script wraps the body in
> `try { ... } finally { await browser.close(); }` so the browser process
> can't be orphaned on an error path.

- [x] **Step 2: Start the dev server**

Run in the background: `npm run dev`

Wait for it to report the local URL (default `http://localhost:5173`). If it
picked a different port, edit `DEV_SERVER_ORIGIN` in both
`scripts/mint-session.mjs` and `scripts/dev/check-dashboard.mjs` to match,
and re-run `npm run auth:mint`.

- [x] **Step 3: Run the check script**

Run: `node scripts/dev/check-dashboard.mjs`

Expected output: `Authenticated: dashboard loaded` with no `Console error:` lines.

- [x] **Step 4: Inspect the screenshot**

Open `playwright/output/dashboard.png` and confirm it shows the DohDash
dashboard (sidebar/launcher), not the sign-in page.

- [x] **Step 5: Stop the dev server**

Stop the background `npm run dev` process.

- [x] **Step 6: Commit**

```bash
git add scripts/dev/check-dashboard.mjs
git commit -m "Add sample Playwright script for authenticated dashboard check"
```

---

### Task 5: Document the workflow

**Files:**
- Modify: `.claude/context/dohdash.md`

- [x] **Step 1: Add a workflow section**

Append to the end of `.claude/context/dohdash.md`:

```markdown

## Dev auth bypass & browser testing

For local testing/troubleshooting, Claude can load DohDash already
`authenticated` (bypassing Google OAuth) using Playwright:

1. `.env.local` must have `SUPABASE_SERVICE_ROLE_KEY` (service_role secret,
   Project Settings -> API in Supabase). Only read by scripts in `scripts/`
   via `--env-file`; never imported by `src/`.
2. `npm run auth:mint` mints a session for the admin test user
   (`yeg.built.form@gmail.com`) via `generateLink`/`verifyOtp` and writes
   `playwright/.auth/admin.json` (Playwright storageState, gitignored).
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
```

- [x] **Step 2: Commit**

```bash
git add .claude/context/dohdash.md
git commit -m "Document dev auth bypass and Playwright testing workflow"
```
