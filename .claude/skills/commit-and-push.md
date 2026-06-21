---
name: commit-and-push
description: Manual-first git helper — drafts a concise commit message and the exact copy-paste commands for the user to run. Never commits or pushes on its own; a push triggers a live Vercel deploy.
tags: [git, workflow, commit, deploy]
---

# Commit and Push

Prepare a commit for the user to run **themselves**. The user does manual commits
and pushes. Your job is to do the cheap inspection and hand them ready-to-run
commands — not to execute them. Keep token use minimal.

## Hard rule

**Never run `git commit` or `git push` yourself unless the user explicitly says
to in this turn** (e.g. "go ahead and push", "you commit it"). A push
auto-deploys live to Vercel with no further confirmation — see CLAUDE.md Deploy
workflow.

## Workflow

1. **Inspect cheaply.** `git status --short`, `git diff --stat`,
   `git diff --name-only`. Do **not** read full file contents unless a finding
   genuinely requires it for the message.
2. **If clean,** say so and stop.
3. **Branch safety.** If on `master`, note it — most work should branch first.
   Don't silently commit to master.
4. **Draft a message.** Short, imperative, specific. Prefer one line. Infer it
   from filenames/stats. Examples: `fix login redirect`, `update docs`,
   `add tenant_id to remote_sessions`.
5. **Hand over the commands.** Present a copy-paste block the user can run, e.g.:
   ```
   git add <only the relevant paths>
   git commit -m "fix login redirect"
   git push
   ```
   Stage only the files that belong in this commit — never blanket `git add -A`
   if unrelated changes are present.
6. **Offer, don't do.** End with: "Want me to run these?" — and only execute if
   the user says yes in reply.

## Asking about automatic commits

If the user is about to start a **major multi-step task**, it's fine to ask up
front: "Do you want me to commit/push automatically as I go, or hand you the
commands at the end?" Honor their answer for that task only — the default stays
manual.

## Output style

- Be brief. No narration, no code-change summaries unless needed for the message.
- On a failed command (only if the user asked you to run it), report just the
  error and the likely next step.
