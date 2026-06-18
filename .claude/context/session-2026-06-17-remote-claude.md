# Session Summary — Remote Claude debugging (2026-06-17)

Point-in-time handoff notes. **Not** imported into CLAUDE.md (so it doesn't load
every session). Durable feature docs live in `remote-claude.md`.

## Goal of the feature

Trigger a Claude Code session on the PC from a phone: pick a project in the
DohDash "Remote Claude" app → a local Node agent (`agent/agent.js`) opens VS Code
on that project with Claude auto-starting in the integrated terminal → continue
from the Claude mobile app. PC is left running (WOL intentionally skipped).

## What was wrong this session

1. **Agent launched a separate cmd window instead of running Claude inside VS
   Code.** `launchSession()` ran `code` *and* a `start cmd /k ... claude` window;
   the cmd window was where Claude actually started, not VS Code. New folders
   also hit VS Code's "trust this folder?" prompt, blocking unattended launch.
2. **After a PC reboot, sessions hung on "sending request to pc."** Root cause:
   the **agent process simply wasn't running** (nothing auto-started it). A
   secondary risk was the agent depending solely on Supabase Realtime, which had
   been unreliable (migration 0015 enables it).

## Fixes applied

- **`agent/agent.js`**
  - `launchSession` → now calls `ensureClaudeTask()` which writes a
    `.vscode/tasks.json` (`runOn: "folderOpen"`, command
    `claude --dangerously-skip-permissions`, dedicated panel) into the selected
    project, then runs `code "<project>"`. The separate cmd window is gone.
    Written fresh each launch → new projects need zero setup.
  - Added a **polling fallback**: `pollPendingSessions()` queries
    `status='pending'` every 4s (`POLL_INTERVAL_MS`); runs alongside the Realtime
    subscription. An in-process `handled` Set dedupes so a row isn't processed
    twice. The agent no longer depends on Realtime being configured.
- **VS Code user settings** (`%APPDATA%\Code\User\settings.json`, machine-local):
  added `"task.allowAutomaticTasks": "on"` and
  `"security.workspace.trust.enabled": false` for fully-unattended launch.
- **Auto-start on login**: created Startup shortcut "Remote Claude Agent" in
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup` →
  `cmd /k "cd /d <agent dir> && node agent.js"`, minimized.
- **Context docs**: created `.claude/context/remote-claude.md` (durable) and
  added it to CLAUDE.md imports.

## Verified working

Starting the agent immediately cleared 4 stuck `pending` sessions via the new
poll and flipped them to `running` (the user had retried 4×). Agent confirmed
running as a standalone, session-independent process (survives the Claude CLI
closing).

## Important gotchas / state

- **No auto-login on this PC** (`AutoAdminLogon` empty). A remote reboot lands at
  the lock screen with no agent until someone logs in physically — so the Startup
  shortcut only helps *after* login. Do **not** remotely reboot when away; just
  leave the PC on and logged in.
- The agent must be running for the feature to work. If "sending request to pc"
  hangs, first check the agent is alive:
  `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ? { $_.CommandLine -like '*agent.js*' }`
- Run manually: `cd agent && node agent.js` (from `agent/`, where `.env` lives).
- Duplicate retries create multiple `remote_sessions` rows; all get processed but
  `code` reuses one window per folder. Possible future cleanup: collapse
  duplicate pending sessions per (user, project).

## Pending / open items

- **`supabase db push`** to apply `0015_remote_sessions_realtime.sql` (enables
  Realtime on `remote_sessions`). The polling fallback means this is no longer
  required for correctness, but applying it restores instant pickup.
- Agent changes (`agent/agent.js`) are local; the agent runs from the working
  tree, so no push is required for it to take effect. Push to GitHub only if/when
  deploying — needs explicit approval (triggers Vercel auto-deploy).
