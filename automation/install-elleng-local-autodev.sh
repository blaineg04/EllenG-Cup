#!/bin/bash
# One-time install invoked by the Mac owner. Works without Docker.
set -euo pipefail
if [[ "$(uname -s)" != "Darwin" ]]; then echo "Mac only"; exit 1; fi
WORKFLOW_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="$HOME/elleng-local-autodev-control"
mkdir -p "$TARGET" "$HOME/Library/LaunchAgents"
cp "$WORKFLOW_DIR/elleng-local-development-cycle.sh" "$TARGET/cycle.sh"
chmod 700 "$TARGET/cycle.sh"
cp "$WORKFLOW_DIR/review-elleng-local-patch.sh" "$TARGET/review.sh"
chmod 700 "$TARGET/review.sh"
PLIST="$HOME/Library/LaunchAgents/com.elleng.local-autodev.plist"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.elleng.local-autodev</string>
<key>ProgramArguments</key><array><string>/bin/bash</string><string>$TARGET/cycle.sh</string></array>
<key>StartInterval</key><integer>1800</integer>
<key>RunAtLoad</key><true/>
<key>StandardOutPath</key><string>$HOME/elleng-autodev-stdout.log</string>
<key>StandardErrorPath</key><string>$HOME/elleng-autodev-stderr.log</string>
</dict></plist>
EOF
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "EllenG Codex local scheduler installed: every 30 minutes while logged in and awake."
echo "Outputs: ~/elleng-local-autodev-output/"
echo "Stop: launchctl bootout gui/$(id -u) '$PLIST'"
