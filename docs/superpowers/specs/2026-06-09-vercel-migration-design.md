# Vercel Migration — Design

## Context

DohDash is currently deployed via Netlify (`netlify.toml` build config + `public/_redirects` for SPA fallback). The user has already created and connected a Vercel project for this repo and wants to fully cut over deployment to Vercel — removing the Netlify-specific config and updating the project docs to describe Vercel as the deploy target.

## Scope

Full cutover (not a parallel/transition setup):

1. **Add `vercel.json`** at the repo root with an SPA rewrite rule so client-side routes (e.g. `/dashboard/admin`) don't 404 on refresh:
   ```json
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
   }
   ```
   Build command and output directory (`dist`) are left to Vercel's Vite framework auto-detection — no need to hardcode and risk drifting from the dashboard's project settings.

2. **Remove Netlify-specific files**:
   - `netlify.toml`
   - `public/_redirects`

3. **Update `.gitignore`** to add `.vercel` (the directory the Vercel CLI writes locally when a project is linked — contains org/project IDs, shouldn't be committed).

4. **Update `CLAUDE.md`** (deploy-related sections only):
   - Tech stack bullet: replace the Netlify hosting/auto-deploy/SPA-fallback description with the Vercel equivalent (Vercel hosting, GitHub auto-deploy, SPA fallback via `vercel.json` rewrites).
   - "Deploy workflow" section: replace `netlify.toml` / `public/_redirects` references and the "Netlify site env vars must mirror `.env.local`" line with the Vercel equivalent (Project Settings → Environment Variables).
   - "Supabase" section: change "the Netlify domain in production" to "the Vercel domain in production" in the OAuth redirect note.

## Out of scope / manual steps (user-performed, not part of this change)

- Confirming `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set in the Vercel project's Environment Variables.
- Updating the OAuth redirect URI in Google Cloud Console and Supabase Auth provider settings to the Vercel domain.
- Verifying Vercel build settings (Framework = Vite, Output = `dist`).
- Decommissioning the Netlify site.

## Where this lands

These changes will be made directly in the current worktree/branch (`worktree-tasks-dohdocs`), alongside the existing in-progress DohDocs work, per user preference.

## Verification

- `npm run build` still produces `dist/` successfully (build command itself is unaffected by this change).
- Confirm `vercel.json` is valid JSON and uses the documented rewrite syntax.
- Manually review updated `CLAUDE.md` sections for accuracy against the new Vercel-based workflow.
- (Post-deploy, user-performed) Load a deep link like `/dashboard/admin` directly on the Vercel deployment to confirm the SPA rewrite works.
