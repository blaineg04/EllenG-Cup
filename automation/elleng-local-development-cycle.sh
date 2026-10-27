#!/bin/bash
# EllenG Cup local development cycle: no API billing, no remote writes.
set -euo pipefail
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:$HOME/.volta/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
for c in "$HOME/.nvm/versions/node"/*/bin/codex "$HOME/.local/share/mise/installs/node"/*/bin/codex /Applications/Codex.app/Contents/Resources/codex; do
  if test -x "$c"; then export PATH="$(dirname "$c"):$PATH"; break; fi
done
ROOT="$HOME/elleng-local-autodev"
OUT="$HOME/elleng-local-autodev-output"
mkdir -p "$OUT"
# macOS does not ship flock; use mkdir as an additional portable lock.
mkdir "$OUT/.running" 2>/dev/null || exit 0
trap 'rmdir "$OUT/.running" 2>/dev/null || true' EXIT
if ! command -v codex >/dev/null || ! codex login status >/dev/null 2>&1; then
  echo "Codex missing or not authenticated"; exit 1
fi
if ! test -d "$ROOT/.git"; then
  git clone --branch development/nov20-release-reconciliation-20261026 --single-branch https://github.com/blaineg04/EllenG-Cup.git "$ROOT"
fi
cd "$ROOT"
if test "$(git branch --show-current)" != "development/nov20-release-reconciliation-20261026"; then
  echo "Wrong branch; refusing"; exit 1
fi
# A persistent local checkout retains work across cycles; no rebases or resets.
DATE="$(date -u +%Y%m%dT%H%M%SZ)"
cat > "$OUT/task.txt" <<'TASK'
Work on EllenG Cup in this local development checkout only.
Improve one unfinished November 13 draft rehearsal acceptance check or
related implementation. Review git diff and existing changes before
starting; do not repeat a completed improvement. Keep work small.
Run local checks relevant to edited code. Preserve scramble front nine
and lowest-single-golfer-score shamble back nine.
Never access production, Supabase, Vercel, FairwayOS, credentials, or
network. Never commit, push, deploy, change GitHub workflows, or merge.
Do not modify files outside this checkout. Report test results clearly.
TASK
# Isolate local file writes; sandbox generally blocks network access.
codex exec --sandbox workspace-write --skip-git-repo-check - < "$OUT/task.txt" > "$OUT/$DATE.log" 2>&1
# Include new tests as intent-to-add, without adding them to any remote branch.
while IFS= read -r -d '' file; do git add -N -- "$file"; done < <(git ls-files --others --exclude-standard -z -- . ':!.github' ':!automation')
# Check only tests for whitespace; legacy HTML contains known old whitespace.
# Always capture a patch even when other changed files have formatting issues.
if ! git diff --check -- tests/; then
  echo "Test changes need whitespace review" > "$OUT/$DATE-validation-warning.txt"
fi
git diff --binary -- . ':!.github' ':!automation' > "$OUT/latest-development.patch"
git diff --stat -- . ':!.github' ':!automation' > "$OUT/$DATE-summary.txt"
if ! test -s "$OUT/latest-development.patch"; then echo "No reviewable code changes produced"; exit 1; fi
echo "Cycle completed: $DATE (review-only local patch)"
