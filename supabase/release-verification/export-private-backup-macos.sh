#!/usr/bin/env bash
# Create a LOCAL backup; never commit backups or connection strings to GitHub.
# Usage: Set PGHOST, PGPORT, PGUSER, PGDATABASE and PGPASSWORD or PGPASSFILE
# from Supabase's direct database connection details; then run this script.
set -euo pipefail
command -v pg_dump >/dev/null || { echo 'Missing pg_dump (PostgreSQL client).'; exit 1; }
command -v pg_restore >/dev/null || { echo 'Missing pg_restore (PostgreSQL client).'; exit 1; }
command -v shasum >/dev/null || { echo 'Missing shasum.'; exit 1; }
: "${PGHOST:?Set PGHOST using your Supabase database connection details}"
: "${PGUSER:?Set PGUSER using your Supabase database connection details}"
: "${PGDATABASE:?Set PGDATABASE using your Supabase database connection details}"
if [[ -z "${PGPASSWORD:-}" && -z "${PGPASSFILE:-}" ]]; then
  echo 'Set PGPASSWORD or a private PGPASSFILE. Never paste credentials into chat.' >&2
  exit 1
fi
umask 077
BASE="${HOME}/elleng-private-backups"
mkdir -p "$BASE"
chmod 700 "$BASE"
NOW="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BASE/elleng-$NOW"
mkdir -m 700 "$DEST"
echo 'Exporting a private snapshot of application tables and account mappings...'
# Includes schema, data, indexes, constraints, policies and stored functions in
# application schemas. Supabase platform configuration and external Auth secrets
# are NOT fully captured by this command.
pg_dump --format=custom --no-owner --no-privileges --schema=public --schema=auth --file="$DEST/application.dump"
pg_restore --list "$DEST/application.dump" > "$DEST/archive-contents.txt"
test -s "$DEST/archive-contents.txt"
# Confirm critical tables are actually present in the archive; a non-empty dump
# could otherwise be incomplete without the script noticing.
for table in elleng_drafts elleng_tournaments elleng_player_accounts elleng_captains elleng_player_hole_scores elleng_team_scores elleng_pair_hole_scores; do
  if ! grep -Eq " TABLE (DATA )?public ${table}( |$)" "$DEST/archive-contents.txt"; then
    echo "Missing required table in backup archive: ${table}" >&2
    exit 1
  fi
done
shasum -a 256 "$DEST/application.dump" > "$DEST/SHA256SUMS"
(cd "$DEST" && shasum -a 256 -c SHA256SUMS)
echo "LOCAL BACKUP CREATED: $DEST"
echo 'IMPORTANT: A readable archive is not a verified restore. Restore into an isolated database and test before relying on it.'
echo 'Do not upload this directory to GitHub, cloud logs, or ChatGPT.'
