# Remote Claude — Context

App id `remote-claude`. Lets the user trigger a Claude Code session on their PC
from a phone: pick a project in DohDash → a local Node agent opens VS Code on
that project with Claude auto-starting in the integrated terminal. The user then
continues the session from the Claude mobile app. WOL is intentionally skipped —
the PC is left running.

## Two halves

1. **Web app** — `src/apps/remote-claude/RemoteClaudeApp.tsx` (+ `.css`). Two
   views: "pick" (project grid) and "status" (pending → starting → running).
   Agent shown "online" if `remote_projects.last_seen` is within 10 minutes.
   Subscribes to its session row via `subscribeToRemoteSession`.
2. **Local agent** — `agent/agent.js` (Node, runs on the user's Windows PC).
   Not part of the deployed app; the user runs it locally.

## DB tables (migrations `0014_remote_claude.sql`, `0015_remote_sessions_realtime.sql`)

- `remote_projects (id text PK, name, path, last_seen bigint)` — the agent
  upserts the discovered project list; web app reads it (RLS SELECT for
  authenticated users).
- `remote_sessions (id uuid PK, user_id, project_id, status, error_message,
  created_at, started_at)` — web app INSERTs a `pending` row; agent updates
  `status` to `starting` → `running` (or `error`). RLS: users SELECT/INSERT own
  rows. Migration 0015 adds the table to the `supabase_realtime` publication and
  sets `replica identity full`.

## Agent behavior (`agent/agent.js`)

- **Config** in `agent/.env` (gitignored): `SUPABASE_URL`,
  `SUPABASE_SERVICE_KEY` (service role — bypasses RLS so the agent can write),
  `AI_FOLDER` (default `~/iCloudDrive/Ai`).
- **Project discovery:** scans `AI_FOLDER` subdirs; a dir counts as a project if
  it has `.git`, `CLAUDE.md`, or `package.json`. Upserts to `remote_projects`
  every 5 min (`SYNC_INTERVAL_MS`).
- **Session pickup — two paths, deduped by an in-process `handled` Set:**
  1. **Polling fallback (the reliable path):** `pollPendingSessions()` queries
     `status='pending'` every 4s (`POLL_INTERVAL_MS`). Works regardless of
     Realtime config and catches requests made while the agent was down. This is
     what makes the system robust — the agent does **not** depend on Realtime.
  2. **Realtime:** `postgres_changes` INSERT subscription for instant pickup
     when it's working. Filters `status === "pending"` in JS (not a server-side
     filter, which was unreliable without `replica identity full`).
- **Launch (`launchSession` → `ensureClaudeTask`):** writes a `.vscode/tasks.json`
  into the selected project with a `runOn: "folderOpen"` task that runs
  `claude --dangerously-skip-permissions` in VS Code's integrated terminal, then
  opens `code "<project>"`. No separate cmd window. Written fresh each launch so
  new projects need zero per-project setup.

## Required VS Code USER settings (set once, machine-local — not in the repo)

In `%APPDATA%\Code\User\settings.json`, needed for fully-unattended launch:
- `"task.allowAutomaticTasks": "on"` — run the folder-open task without prompting.
- `"security.workspace.trust.enabled": false` — skip the "trust this folder?"
  prompt on new projects.

## Auto-start on login

A Startup shortcut ("Remote Claude Agent" in
`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`) launches the agent
(minimized) at login via `cmd /k "cd /d <agent dir> && node agent.js"`, so a
reboot doesn't leave requests hanging on "sending request to pc". To run
manually: `cd agent && node agent.js`.
