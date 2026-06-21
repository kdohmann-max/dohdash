#!/usr/bin/env bash
# Stop hook: when Claude finishes a task and there's an uncommitted diff,
# block the stop once and ask the main agent to convene the Senate (the
# sober-second-thought critic subagent) against the change.
#
# Loop prevention (two layers):
#   1. stop_hook_active — true when this stop was itself triggered by a stop
#      hook (i.e. the review already ran and Claude is stopping again). We let
#      that stop through so we never block twice in a row.
#   2. diff-hash guard — we record the hash of the diff we last triggered on.
#      If the diff hasn't changed, we don't re-trigger, so an unchanged tree
#      across multiple turns only gets reviewed once.
#
# Exit codes: 0 = allow stop; 2 = block stop, stderr is fed back to Claude.

set -euo pipefail

input="$(cat)"

# Layer 1: already inside a stop-hook continuation — allow the stop.
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

# Must be in a git repo.
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$repo_root" ] && exit 0
cd "$repo_root"

# Combined diff: unstaged + staged. Untracked files don't show in `git diff`,
# so include their names too (a new file is also "work to second-guess").
diff="$(git diff; git diff --cached; git ls-files --others --exclude-standard)"
[ -z "$diff" ] && exit 0

# Layer 2: skip if this exact diff was already sent for review.
hash="$(printf '%s' "$diff" | sha1sum | cut -d' ' -f1)"
state_file="$repo_root/.git/.senate-last"
last="$(cat "$state_file" 2>/dev/null || true)"
[ "$hash" = "$last" ] && exit 0

# Record before blocking so the re-entry stop (and unchanged future stops)
# won't re-trigger.
printf '%s' "$hash" > "$state_file"

# Block the stop and tell the main agent what to do. This text is fed back
# to Claude as the reason it can't stop yet.
cat >&2 <<'MSG'
There is an uncommitted diff. Before wrapping up, convene the Senate: run the
`senate` subagent (via the Agent tool, subagent_type: "senate") to critique the
DIRECTION of this change — scope creep, over-engineering, bad bets, work that
shouldn't exist, or anything dumb either of us is about to ship. Pass it a short
description of what was just done so it has context. Relay its verdict to the
user, then you may stop. If the user already explicitly approved this exact
change, you may note that and stop without re-running.
MSG
exit 2
