# Operator Assistant — Context

The operator's in-dashboard AI coding agent. Lets the super-admin submit natural-language
tasks ("fix the time-tracker bug", "add a CSV import to Time Dashboard") and receive a
live-streamed transcript, proposed diff, and a one-click **Approve & deploy** gate.

Not a tenant feature — operator-only. Zero crossover with any tenant by construction.

## Architecture overview

Two halves, same pattern as Remote Claude:

1. **Web app** — `src/operator/OperatorAssistant.tsx` (+ `.css`) at route
   `/dashboard/operator/assistant`. Super-admin only (`profile.superAdmin`). Shows a
   sidebar of conversations, a live transcript, a diff review panel, and a pinned
   composer.

2. **Local agent** — `agent/agent.js` (same Node process as Remote Claude). Polls
   `operator_runs` for `pending` work, spawns `claude` CLI headless, streams events
   back to the DB, captures the diff, and awaits operator approval before touching git.

## DB tables — migration `0025_operator_assistant.sql`

**No `tenant_id` on any table** — Template B exception (same as `tenants` in 0024):
these are operator-global records about the DohDash product itself, not tenant-owned
app data. All three gated by `is_super_admin()` on every policy.

| Table | Purpose |
|---|---|
| `operator_conversations` | A chat thread tied to one discovered project (FK → `remote_projects.id`) |
| `operator_runs` | One agent invocation: prompt, model, effort, status, branch, diff, summary |
| `operator_messages` | Streamed transcript: user/assistant/tool/status/error rows |

`operator_runs.status` lifecycle:
`pending` → `running` → `awaiting_approval` → `approved` → `deploying` → `deployed`
                      ↘ `error`              ↘ `discarded`

Both `operator_runs` and `operator_messages` are in the `supabase_realtime` publication
with `replica identity full` — the dashboard streams live without polling.

## Storage — `src/storage/operator.ts`

Follows the `remote.ts` Row/domain/mapper pattern. Re-exported via `db.ts` barrel.

Key exports: `OperatorConversation`, `OperatorRun`, `OperatorRunStatus`,
`OperatorMessage`, `OperatorMessageKind`

CRUD: `listOperatorConversations`, `createOperatorConversation`,
`renameOperatorConversation`, `deleteOperatorConversation`, `listOperatorRuns`,
`createOperatorRun`, `setOperatorRunStatus`, `listOperatorMessages`,
`appendOperatorMessage`

Realtime: `subscribeToOperatorMessages(conversationId, cb)`,
`subscribeToOperatorRuns(conversationId, cb)` — both return unsubscribe functions.

## Agent additions — `agent/agent.js`

Constants: `OP_POLL_INTERVAL_MS = 4000`, `inFlightRuns Set` (dedup),
`OP_GUARDRAILS` system-prompt string (tells Claude: no commit/push, read journal, record decisions).

Key functions:

| Function | What it does |
|---|---|
| `git(path, args)` | `execSync` wrapper; throws on non-zero |
| `opMessage(run, kind, content)` | Inserts into `operator_messages` (service role) |
| `opRunUpdate(runId, patch)` | Updates `operator_runs` (service role) |
| `handleClaudeEvent(run, evt)` | Forwards `assistant`-type stream events to DB transcript |
| `runClaudeHeadless(run, projectPath)` | Spawns `claude -p --output-format stream-json --verbose --model <m> --effort <e> --permission-mode acceptEdits --append-system-prompt <guardrails>`, writes prompt to stdin, parses NDJSON |
| `startOperatorRun(run)` | Pre-flight: requires clean `git status --porcelain`; runs headless Claude; captures `git diff --cached`; → `awaiting_approval` |
| `deployOperatorRun(run)` | On approval: `git add -A`, `git commit`, `git push` |
| `discardOperatorRun(run)` | `git reset --hard HEAD` + `git clean -fd` |
| `pollOperatorRuns()` | Queries `status in ('pending','approved','discarded')` every 4s |

**Safety model:** `--permission-mode acceptEdits` means the Claude subprocess can edit
files but **cannot run shell/git commands**. Only `agent.js` code calls git, and only
on the `approved` status transition. The agent also requires a clean working tree before
starting any run — dirty tree → `error` status, no work done.

## UI — `src/operator/OperatorAssistant.tsx`

Own-height shell layout (fixed sidebar + scrolling transcript + pinned composer —
same pattern as DohDocs, not flow-scroll).

- **Sidebar** (240px): conversation list, `+ New`, `← Tenants` back-link.
- **Header**: project name, online dot (green if `remote_projects.last_seen` < 10min), run status badge, agent-offline warning banner.
- **Transcript**: per-kind CSS classes (`--user` right-aligned blue, `--assistant` left-aligned card, `--tool` mono muted, `--status` centered italic, `--error` red). Auto-scrolls on new messages.
- **Review panel** (appears when `run.status === 'awaiting_approval'`): summary text, `DiffView` sub-component (add/del/hunk/meta line classes), **Approve & deploy** (accent primary) + **Discard** (error outline). Warning note: "Approving commits and pushes — this deploys live to Vercel."
- **Composer**: project `<select>` (new conversations only), `<textarea>` (Cmd+Enter submits), model select, effort select, Send button.
- `upsertById<T>()` helper merges Realtime events into sorted lists.

## Models & effort

| Model | When |
|---|---|
| `claude-opus-4-8` (default) | Standard work — `high` effort |
| `claude-fable-5` | Opt-in hard mode — 2× cost, max reasoning |

Effort options: `low` / `medium` / `high` / `xhigh` / `max`

## Product brain journal

`.claude/context/operator-journal.md` — private goals and decision log. The agent reads
it on every run via `OP_GUARDRAILS` (`--append-system-prompt`). Claude is instructed to
append significant new decisions there as part of its changes. Edit directly to record
goals or constraints you want the agent to always know.

## Gotchas

- **Clean tree required.** The agent checks `git status --porcelain` before starting.
  Any uncommitted changes → `error` status. Commit or stash first.
- **`acceptEdits` only.** The headless Claude subprocess cannot run bash, git, or any
  shell command. It can only read and edit files. If a task needs `npm install` or a DB
  migration, do it yourself before/after approving.
- **stream-json event shape unverified at runtime.** Parsed defensively (guard on
  `type === 'assistant'`, content block types), but the exact Claude CLI output format
  should be confirmed on the first real run and corrected if needed.
- **`remote_projects` FK.** Conversations FK to `remote_projects.id` (the same table
  Remote Claude uses). The agent must be running and have synced projects for the
  project dropdown to be non-empty.
- **Approval is irreversible (push = live deploy).** The Approve button warns of this.
  The Discard path (`git reset --hard + clean -fd`) is also destructive to the working
  tree — use it only when you've reviewed the diff and decided against it.
