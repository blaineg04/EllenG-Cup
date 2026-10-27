#!/bin/bash
# Offline negative acceptance test for the unattended PR submitter.
set -euo pipefail
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/submit-elleng-safe-draft-pr.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/home/elleng-local-autodev" "$TMP/home/elleng-local-autodev-output" "$TMP/bin"
cd "$TMP/home/elleng-local-autodev"
git init -q
git checkout -q -b development/nov20-release-reconciliation-20261026
printf '%s\n' '<p>baseline</p>' > scoring.html
git add scoring.html
git -c user.name=test -c user.email=test@example.invalid commit -qm baseline
printf '%s\n' '<p>changed</p>' > scoring.html
cat > "$TMP/bin/gh" <<'GH'
#!/bin/bash
if [ "${1:-}" = auth ] && [ "${2:-}" = status ]; then exit 0; fi
echo "UNSAFE GITHUB CLI INVOCATION" >&2
exit 99
GH
cat > "$TMP/bin/node" <<'NODE'
#!/bin/bash
exit 0
NODE
chmod +x "$TMP/bin/gh" "$TMP/bin/node"
set +e
OUTPUT="$(HOME="$TMP/home" PATH="$TMP/bin:$PATH" bash "$SCRIPT" 2>&1)"
CODE=$?
set -e
printf '%s\n' "$OUTPUT"
test "$CODE" -eq 2
printf '%s\n' "$OUTPUT" | grep -q 'BLOCKED unexpected file: scoring.html'
echo "PASS: application edit rejected before any PR or push."
