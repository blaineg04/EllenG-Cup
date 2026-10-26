#!/usr/bin/env bash
# EllenG Cup local acceptance gate. Read-only. Never connects to hosted Supabase.
set -euo pipefail
CONTEXT="colima-elleng-test"
CONTAINER="supabase_db_supabase-rehearsal"
EXPECTED_SOCKET="/Volumes/EllenG-Test/colima-home/elleng-test/docker.sock"
PROJECT="/Volumes/EllenG-Test/supabase-rehearsal"
fail=0
pass() { printf 'PASS %s\n' "$1"; }
block() { printf 'BLOCKED %s\n' "$1"; fail=1; }
if [[ ! -d "$PROJECT/supabase" || ! -S "$EXPECTED_SOCKET" ]]; then
  echo 'BLOCKED: expected USB-local Supabase environment or Docker socket missing'; exit 2
fi
if ! command -v docker >/dev/null; then echo 'BLOCKED: docker CLI missing'; exit 2; fi
actual="$(docker context inspect "$CONTEXT" --format '{{(index .Endpoints "docker").Host}}' 2>/dev/null || true)"
if [[ "$actual" != "unix://$EXPECTED_SOCKET" ]]; then
  echo "BLOCKED: Docker context does not point to expected external USB socket"; exit 2
fi
if ! docker --context "$CONTEXT" inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null | grep -qx true; then
  echo 'BLOCKED: isolated local database container is not running'; exit 2
fi
sql() {
  docker --context "$CONTEXT" exec "$CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -Atqc "$1"
}
if [[ "$(sql "SELECT count(*) FROM pg_class WHERE oid IN ('public.elleng_drafts'::regclass,'public.elleng_captains'::regclass) AND relrowsecurity")" == 2 ]]; then
  pass 'Base draft/captain tables have RLS enabled'
else
  block 'Draft/captain RLS is missing'
fi
if [[ "$(sql "SELECT count(*) FROM auth.users WHERE email IN ('elleng-commissioner@example.test','elleng-captain@example.test','elleng-golfer@example.test') AND email_confirmed_at IS NOT NULL")" == 3 ]]; then
  pass 'Three local synthetic users confirmed'
else
  block 'Required local synthetic users missing or unconfirmed'
fi
if [[ "$(sql "SELECT count(*) FROM public.elleng_drafts d JOIN auth.users u ON d.owner_id=u.id JOIN public.elleng_captains c ON c.draft_id=d.id JOIN auth.users a ON c.user_id=a.id WHERE d.id='elleng-isolated-rehearsal' AND u.email='elleng-commissioner@example.test' AND a.email='elleng-captain@example.test'")" == 1 ]]; then
  pass 'Practice draft ownership and captain assignment'
else
  block 'Practice draft / captain assignment missing'
fi
if [[ "$(sql "SELECT to_regclass('public.elleng_player_hole_scores') IS NOT NULL")" == t ]]; then
  pass 'Individual hole score table exists'
else
  block 'Missing individual hole scores baseline schema; do not apply 18-hole migration yet'
fi
if [[ "$(sql "SELECT to_regprocedure('public.elleng_pick_balance_penalty(jsonb,integer,text)') IS NOT NULL")" == t ]]; then
  pass 'Auto-pick penalty helper exists'
else
  block 'Missing draft balance helper; do not apply auto-pick migration yet'
fi
if [[ "$(sql "SELECT to_regprocedure('public.elleng_auto_pick(text)') IS NOT NULL")" == t ]]; then
  pass 'Auto-pick function exists'
else
  block 'Auto-pick release migration not installed in local test DB'
fi
if (( fail )); then
  echo 'RESULT: BLOCKED — prerequisites incomplete. No production writes and no local changes made.'
  exit 2
fi
echo 'RESULT: PREFLIGHT PASS. Run authenticated draft/scoring and two-device tests separately.'
