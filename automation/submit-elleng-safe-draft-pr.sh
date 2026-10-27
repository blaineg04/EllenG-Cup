#!/bin/bash
# Conservative unattended PR handoff. Never deploys, merges, or modifies release branch.
set -euo pipefail
ROOT="$HOME/elleng-local-autodev"
OUT="$HOME/elleng-local-autodev-output"
BASE="development/nov20-release-reconciliation-20261026"
cd "$ROOT"
if [[ "$(git branch --show-current)" != "$BASE" ]]; then echo "BLOCKED wrong branch"; exit 2; fi
if ! command -v gh >/dev/null || ! gh auth status >/dev/null 2>&1; then
 echo "BLOCKED GitHub CLI is missing or unauthenticated; local patch retained"; exit 2
fi
command -v node >/dev/null || { echo "BLOCKED node unavailable"; exit 2; }
# Work on only new tests and markdown docs. Existing app, auth and scoring files
# must be reviewed manually. The entire dirty tree must obey this rule.
mapfile_cmd=()
while IFS= read -r -d '' p; do mapfile_cmd+=("$p"); done < <(git ls-files -m -o --exclude-standard -z)
if [[ "${#mapfile_cmd[@]}" -eq 0 ]]; then echo "No changes"; exit 0; fi
for p in "${mapfile_cmd[@]}"; do
 case "$p" in
   tests/*.test.cjs|docs/*.md) ;;
   *) echo "BLOCKED unexpected file: $p (local patch preserved)"; exit 2 ;;
 esac
 [[ ! "$p" == *..* && ! -L "$p" && -f "$p" ]] || { echo "BLOCKED unsafe path"; exit 2; }
done
git diff --check -- tests/ docs/ || { echo "BLOCKED whitespace"; exit 2; }
# All modified tests must pass, not only syntax-check.
for p in "${mapfile_cmd[@]}"; do
 case "$p" in tests/*.test.cjs) node --check "$p"; node --test "$p";; esac
done
# Avoid generating repeated PRs from identical dirty workspaces.
PATCH_HASH="$(shasum -a 256 "$OUT/latest-development.patch" | awk '{print $1}')"
if [[ -e "$OUT/review/submitted-$PATCH_HASH" ]]; then echo "Already submitted"; exit 0; fi
BRANCH="agent/elleng-review-${PATCH_HASH:0:12}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
# A fresh local clone from the trusted base commit prevents unrelated dirty files
# from leaking into the proposed PR.
git clone --quiet --no-local --branch "$BASE" "$ROOT" "$TMP/pr"
cd "$TMP/pr"
git switch -c "$BRANCH"
for p in "${mapfile_cmd[@]}"; do
 mkdir -p "$(dirname "$p")"
 cp "$ROOT/$p" "$p"
 git add -- "$p"
done
git diff --cached --check
git diff --cached --quiet && { echo "No staged changes"; exit 0; }
git -c user.name='EllenG Local Agent' -c user.email='elleng-local-agent@users.noreply.github.com' commit -m "test: propose offline EllenG rehearsal coverage"
# Push only the new agent branch. Never use --force.
git push origin "HEAD:refs/heads/$BRANCH"
gh pr create --repo blaineg04/EllenG-Cup --base "$BASE" --head "$BRANCH" --draft \
 --title "Agent review: offline rehearsal tests ${PATCH_HASH:0:12}" \
 --body "Automated local Codex proposal. Offline checks passed for edited tests only. Requires human review and GitHub CI. No production approval. No merge or deployment authorized."
mkdir -p "$OUT/review"
printf '%s\n' "$BRANCH" > "$OUT/review/submitted-$PATCH_HASH"
echo "Draft PR created: $BRANCH (human review required)"
