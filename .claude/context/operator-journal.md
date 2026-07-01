# Operator Journal — DohDash product brain

Private working notes for the platform operator (kdohmann@gmail.com): goals,
decisions, and direction for the DohDash product itself. The in-dashboard
operator assistant reads this at the start of every run for context, and records
significant new decisions here as part of its changes. It doubles as context for
desktop Claude Code.

This file is operator-domain only — it is never exposed to any tenant. Keep one
decision per entry, newest at the top, with the date and the *why*, not just the *what*.

## Goals (living)

- Ship a "Personal Assistant" (Jarvis / second-brain) layer for DohDash.
- Operator layer first: a coding agent reachable from the dashboard that can fix,
  create, and grow DohDash apps — approval-gated so nothing deploys without a click.
- Then a per-tenant assistant (paid, RLS-siloed) that takes real actions in apps.

## Decisions

### 2026-06-30 — Operator coding assistant, first slice
- Built as an evolution of Remote Claude, not a new agent: the local `agent.js`
  gained a headless run loop that drives the `claude` CLI (`-p --output-format
  stream-json`, `--permission-mode acceptEdits`) so it can edit files but cannot
  push — only the agent commits/pushes, and only on operator approval.
- Data lives in super-admin-gated tables (`operator_conversations`/`_runs`/`_messages`,
  migration 0025), no `tenant_id` — zero tenant crossover.
- Model default `claude-opus-4-8` at `high` effort; `claude-fable-5` available as
  opt-in hard mode. Auth reuses the Claude Code login on the PC.
- **Why:** operator-first is isolated (no tenant risk), highest personal value, and
  reuses infrastructure already built.
