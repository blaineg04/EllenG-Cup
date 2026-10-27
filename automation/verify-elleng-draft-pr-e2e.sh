#!/bin/bash
# One-time end-to-end test of EllenG local draft PR handoff.
# Creates only a disposable test file on a new agent branch and draft PR.
set -euo pipefail
export PATH="$HOME/.local/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
BASE="development/nov20-release-reconciliation-20261026"
REAL="$HOME/elleng-local-autodev"
OUT="$HOME/elleng-local-autodev-output"
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/submit-elleng-safe-draft-pr.sh"
command -v gh >/dev/null && gh auth status >/dev/null 2>&1 || { echo "BLOCKED: GitHub CLI sign-in required"; exit 1; }
command -v node >/dev/null || { echo "BLOCKED: Node required"; exit 1; }
test -d "$REAL/.git" || { echo "BLOCKED: local EllenG checkout missing"; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/home/elleng-local-autodev-output/review"
git clone -q --no-local --branch "$BASE" "$REAL" "$TMP/home/elleng-local-autodev"
cd "$TMP/home/elleng-local-autodev"
git remote set-url origin https://github.com/blaineg04/EllenG-Cup.git
mkdir -p tests
FILE="tests/agent-draft-pr-smoke.test.cjs"
cat > "$FILE" <<'TEST'
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
test('isolated draft PR automation smoke test',()=>assert.equal(2+2,4));
TEST
git add -N "$FILE"
git diff --binary -- "$FILE" > "$TMP/home/elleng-local-autodev-output/latest-development.patch"
# The submitter uses HOME for the test checkout; no production or other repos.
HOME="$TMP/home" PATH="$PATH" bash "$SCRIPT"
echo "PASS: test-only draft PR handoff completed."
echo "Review the created PR on GitHub, then close it and delete its agent branch after checking."
