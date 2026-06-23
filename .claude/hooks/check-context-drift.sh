#!/usr/bin/env bash
# Post-commit hook: warn when source files change without a corresponding
# update to .claude/context/. Emits a plain-text warning — never blocks.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
[ -z "$repo_root" ] && exit 0
cd "$repo_root"

# On the very first commit there is no parent; nothing to compare.
git rev-parse HEAD~1 >/dev/null 2>&1 || exit 0

CHANGED="$(git diff --name-only HEAD~1 HEAD)"

SOURCE_CHANGED="$(printf '%s' "$CHANGED" | grep -E '^(src/storage/|src/apps/|src/operator/|supabase/migrations/)' || true)"
CONTEXT_CHANGED="$(printf '%s' "$CHANGED" | grep -E '^\.claude/context/' || true)"

[ -z "$SOURCE_CHANGED" ] && exit 0
[ -n "$CONTEXT_CHANGED" ] && exit 0

echo ""
echo "context drift: source changed, .claude/context/ did not"
echo "---"
printf '%s\n' "$SOURCE_CHANGED"
echo "---"
echo "consider updating the relevant context file before the next push."
echo ""
