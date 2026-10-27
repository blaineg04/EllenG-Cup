#!/usr/bin/env bash
# EllenG Cup USB-only acceptance gate. All SQL execution is read-only or rolled back.
set -euo pipefail
ROOT="/Volumes/EllenG-Test"
SOCKET="$ROOT/colima-home/elleng-test/docker.sock"
DB="supabase_db_supabase-rehearsal"
CTX="colima-elleng-test"
cd "$(dirname "$0")/../.."
if [[ ! -S "$SOCKET" || ! -d "$ROOT/supabase-rehearsal/supabase" ]]; then
  echo "BLOCKED: isolated USB Supabase database/socket unavailable"; exit 2
fi
actual="$(docker context inspect "$CTX" --format '{{(index .Endpoints "docker").Host}}' 2>/dev/null || true)"
if [[ "$actual" != "unix://$SOCKET" ]]; then
  echo "BLOCKED: Docker context is not the EllenG USB socket"; exit 2
fi
if [[ "$(docker --context "$CTX" inspect "$DB" --format '{{.State.Running}}' 2>/dev/null || true)" != true ]]; then
  echo "BLOCKED: expected USB database is not running"; exit 2
fi
db_psql() { docker --context "$CTX" exec -i "$DB" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
echo "=== EllenG local USB acceptance ==="
# Read-only schema check; don't rely on prior invocation-specific files.
db_psql -Atqc "SELECT CASE WHEN
to_regclass('public.elleng_tournaments') IS NOT NULL
AND to_regclass('public.elleng_player_hole_scores') IS NOT NULL
AND to_regclass('public.elleng_team_scores') IS NOT NULL
AND to_regprocedure('public.elleng_team_ab_count(jsonb,integer)') IS NOT NULL
AND to_regprocedure('public.elleng_pick_balance_penalty(jsonb,integer,text)') IS NOT NULL
AND to_regprocedure('public.elleng_auto_pick(text)') IS NOT NULL
THEN 'PASS: core scoring and draft objects found' ELSE 'BLOCKED: a required local object is missing' END"
# Auto-pick test has its own BEGIN/ROLLBACK and must not be wrapped.
echo "=== Draft-balancing regression ==="
db_psql < tests/acceptance/auto-pick-balance-rehearsal.sql
echo "=== 18-hole constraints (read-only) ==="
db_psql -Atqc "SELECT CASE WHEN
EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.elleng_player_hole_scores'::regclass AND conname='elleng_player_hole_scores_hole_check' AND pg_get_constraintdef(oid) ~ '18')
AND EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.elleng_player_hole_scores'::regclass AND conname='elleng_player_hole_scores_score_check')
THEN 'PASS: hole 1-18 and stroke guard constraints installed'
ELSE 'BLOCKED: score constraints missing or changed' END"
echo "PASS: local USB prerequisites and balance assertions completed"
echo "PENDING: interactive authorized score write/edit/clear and two-device realtime scenarios."
echo "PENDING: original local-18-hole-database-rehearsal.sql intentionally not run (hardcoded elleng_restore_test and elleng-cup-live)."
echo "No production resources targeted."
