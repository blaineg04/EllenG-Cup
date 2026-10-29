#!/bin/bash
# Run after a local Codex cycle. Read-only review gate: no push or deployment.
set -euo pipefail
ROOT="$HOME/elleng-local-autodev"
OUT="$HOME/elleng-local-autodev-output"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT/review"
cd "$ROOT"
PATCH="$OUT/latest-development.patch"
REPORT="$OUT/review/$STAMP-report.txt"
{
 echo "EllenG Cup local review $STAMP"
 echo "Branch: $(git branch --show-current)"
 if [ "$(git branch --show-current)" != "development/nov20-release-reconciliation-20261026" ]; then
   echo "BLOCKED wrong branch"; exit 2
 fi
 if [ ! -s "$PATCH" ]; then echo "BLOCKED empty patch"; exit 2; fi
 shasum -a 256 "$PATCH"
 echo "Files changed:"
 git diff --name-status -- . ':!.github' ':!automation'
 echo "Patch size bytes: $(wc -c < "$PATCH")"
 echo "Checks:"
 if git diff --name-only -- . ':!.github' ':!automation' | grep -E '(^|/)(\.env|credentials|secrets)(/|$)|\.(pem|key)$' ; then
    echo "BLOCKED sensitive file path"; exit 2
 fi
 if git diff --check -- tests/; then echo "Test whitespace: PASS"; else echo "Test whitespace: FAIL"; exit 2; fi
 if command -v node >/dev/null 2>&1; then
   find tests -name '*.test.cjs' -type f -print0 | while IFS= read -r -d '' file; do node --check "$file" || exit 2; done
   echo "Node test syntax: PASS"
 else
   echo "Node not found: manual verification required"
 fi
 echo "REVIEW REQUIRED: Patch has NOT been committed, pushed or deployed."
} > "$REPORT" 2>&1
echo "$REPORT"
