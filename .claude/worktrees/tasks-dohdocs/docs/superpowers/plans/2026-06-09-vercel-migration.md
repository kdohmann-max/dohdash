# Vercel Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully cut over DohDash's deploy configuration and docs from Netlify to Vercel.

**Architecture:** This is a config/docs-only change — no application code is affected. Replace Netlify-specific deploy files (`netlify.toml`, `public/_redirects`) with a Vercel equivalent (`vercel.json` with an SPA rewrite), ignore the Vercel CLI's local project-link directory, and update `CLAUDE.md`'s deploy/Supabase sections to describe the new Vercel-based workflow.

**Tech Stack:** Vite + React (build unaffected), Vercel static hosting (Vite framework auto-detection), `vercel.json` rewrites for SPA routing.

---

### Task 1: Add `vercel.json` for SPA routing

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Validate the JSON is well-formed**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "feat: add vercel.json for SPA routing"
```

---

### Task 2: Remove Netlify-specific config files

**Files:**
- Delete: `netlify.toml`
- Delete: `public/_redirects`

- [ ] **Step 1: Remove the files**

```bash
git rm netlify.toml public/_redirects
```

- [ ] **Step 2: Verify they're gone**

Run: `git status --porcelain netlify.toml public/_redirects`
Expected: both lines show `D ` (deleted, staged)

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove Netlify deploy config"
```

---

### Task 3: Ignore the Vercel CLI's local project-link directory

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add `.vercel` to `.gitignore`**

Add this line after the existing `*.local` line in `.gitignore`:

```
# Vercel CLI local project link (org/project IDs)
.vercel
```

- [ ] **Step 2: Verify**

Run: `grep -n ".vercel" .gitignore`
Expected: shows the new line

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore .vercel local project link directory"
```

---

### Task 4: Update `CLAUDE.md` deploy and Supabase sections for Vercel

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the Tech stack bullet**

Find this line in the `## Tech stack` section:

```markdown
- Netlify — static hosting, GitHub auto-deploy, SPA fallback via `public/_redirects`
```

Replace with:

```markdown
- Vercel — static hosting, GitHub auto-deploy, SPA fallback via `vercel.json` rewrites
```

- [ ] **Step 2: Replace the `## Deploy workflow` section**

Find:

```markdown
## Deploy workflow

**NEVER run `git commit` or `git push` without explicit user approval for that specific deploy.** Always stop and ask first — a push triggers a Netlify auto-deploy and goes live immediately, with no further confirmation.

- `netlify.toml`: `npm run build` → publish `dist/`
- `public/_redirects` (`/* /index.html 200`) is required — without it, refreshing a deep link like `/dashboard/admin` 404s
- Netlify site env vars must mirror `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
```

Replace with:

```markdown
## Deploy workflow

**NEVER run `git commit` or `git push` without explicit user approval for that specific deploy.** Always stop and ask first — a push triggers a Vercel auto-deploy and goes live immediately, with no further confirmation.

- `vercel.json` rewrites all routes to `/index.html` — without it, refreshing a deep link like `/dashboard/admin` 404s
- Build command and output directory (`dist`) are auto-detected by Vercel's Vite framework preset
- Vercel project env vars (Project Settings → Environment Variables) must mirror `.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
```

- [ ] **Step 3: Update the Supabase OAuth redirect note**

Find this line in the `## Supabase` section:

```markdown
- Auth: Google OAuth — the redirect URL must be registered in **both** the Google Cloud Console and the Supabase Auth provider settings, for every environment (`http://localhost:5173` in dev, the Netlify domain in production)
```

Replace with:

```markdown
- Auth: Google OAuth — the redirect URL must be registered in **both** the Google Cloud Console and the Supabase Auth provider settings, for every environment (`http://localhost:5173` in dev, the Vercel domain in production)
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update deploy workflow docs for Vercel"
```

---

### Task 5: Verify the build still works end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: `tsc -b` typechecks cleanly and Vite produces `dist/` with no errors (config file changes don't touch the build pipeline, so this should be unaffected)

- [ ] **Step 2: Confirm no leftover Netlify references in tracked files**

Run: `git grep -i netlify`
Expected: no output (all Netlify references removed from tracked files)

---

## Manual follow-up (user-performed, not part of this plan)

- Confirm `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set in the Vercel project's Environment Variables.
- Update the OAuth redirect URI in Google Cloud Console and Supabase Auth provider settings to the Vercel domain.
- Verify Vercel build settings: Framework = Vite, Output = `dist`.
- Decommission the Netlify site once Vercel is confirmed working.
- **Do not push these commits** until you're ready to trigger the Vercel auto-deploy — push requires separate explicit approval per `CLAUDE.md`.
