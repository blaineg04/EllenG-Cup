#!/usr/bin/env bash
set -euo pipefail
# Runs on the existing Mac self-hosted runner; never connects to Supabase.
DB_NAME=elleng_restore_test
if [[ "$(uname -s)" != "Darwin" ]]; then echo "BLOCKED: requires Mac runner"; exit 1; fi
if [[ -x /Applications/Postgres.app/Contents/Versions/latest/bin/psql ]]; then
  PSQL=/Applications/Postgres.app/Contents/Versions/latest/bin/psql
elif command -v psql >/dev/null 2>&1; then
  PSQL="$(command -v psql)"
else
  echo "BLOCKED: local psql not installed"; exit 1
fi
# Verify the restore exists before beginning. Do not create/modify DBs.
if ! "$PSQL" -X -w -h localhost -p 5432 -d "$DB_NAME" -Atqc "select 1 from pg_database where current_database()='elleng_restore_test'" | grep -qx 1; then
  echo "BLOCKED: isolated elleng_restore_test database is unavailable on local port 5432"; exit 1
fi
migration=supabase/migrations/20261026_elleng_auto_pick_balance_alignment.sql
rehearsal=tests/acceptance/auto-pick-balance-rehearsal.sql
# Migration and assertions execute together in one transaction, always rolled back.
{
 echo 'BEGIN;'
 cat "$migration"
 sed -e '/^BEGIN;$/d' -e '/^ROLLBACK;$/d' "$rehearsal"
 echo 'ROLLBACK;'
} | "$PSQL" -X -w -v ON_ERROR_STOP=1 -h localhost -p 5432 -d "$DB_NAME"
echo 'PASS: local auto-pick migration rehearsed and rolled back'
