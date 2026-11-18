#!/usr/bin/env bash
set -euo pipefail
export PGHOST=localhost PGUSER=postgres PGDATABASE=elleng_withdrawal_test
# Start with a restored, score-free draft from the previous fixture.
psql -v ON_ERROR_STOP=1 -c "DELETE FROM public.elleng_player_hole_scores WHERE tournament_id='elleng-cup-live';"
# Session A holds a draft SHARE lock while preparing and committing a score.
psql -v ON_ERROR_STOP=1 <<'SQL' > /tmp/elleng-score-race-a.log 2>&1 &
BEGIN;
SELECT state FROM public.elleng_drafts WHERE id='elleng-cup' FOR SHARE;
SELECT pg_sleep(4);
INSERT INTO public.elleng_player_hole_scores VALUES('elleng-cup-live',13,1,2,4);
COMMIT;
SQL
writer_pid=$!
sleep 1
# Session B must wait for the score transaction and then reject withdrawal.
set +e
psql -v ON_ERROR_STOP=1 <<'SQL' > /tmp/elleng-score-race-b.log 2>&1
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
SELECT public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',(SELECT updated_at FROM public.elleng_drafts WHERE id='elleng-cup'),13,'race');
SQL
withdraw_status=$?
set -e
wait "$writer_pid"
if [[ "$withdraw_status" -eq 0 ]] || ! grep -q 'Scores exist; withdrawal blocked' /tmp/elleng-score-race-b.log; then
  cat /tmp/elleng-score-race-a.log /tmp/elleng-score-race-b.log
  echo 'FAIL: score-first concurrency scenario did not block withdrawal' >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -At -c "SELECT (state->'golfers'->13->>'participating')='true' FROM public.elleng_drafts WHERE id='elleng-cup';" | grep -qx t
echo 'PASS: committed score blocked concurrent withdrawal; golfer remains active'

# Reverse order: use a score-free setup for a new golfer withdrawal.
psql -v ON_ERROR_STOP=1 -c "DELETE FROM public.elleng_player_hole_scores WHERE tournament_id='elleng-cup-live';"
# Commissioner withdrawal commits before a stale score submission.
psql -v ON_ERROR_STOP=1 <<'SQL' > /tmp/elleng-score-race-c.log 2>&1 &
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
BEGIN;
SELECT id FROM public.elleng_tournaments WHERE id='elleng-cup-live' FOR UPDATE;
SELECT id FROM public.elleng_drafts WHERE id='elleng-cup' FOR UPDATE;
SELECT pg_sleep(4);
SELECT public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',(SELECT updated_at FROM public.elleng_drafts WHERE id='elleng-cup'),14,'race-first');
COMMIT;
SQL
withdraw_pid=$!
sleep 1
set +e
psql -v ON_ERROR_STOP=1 <<'SQL' > /tmp/elleng-score-race-d.log 2>&1
INSERT INTO public.elleng_player_hole_scores VALUES('elleng-cup-live',14,1,3,4);
SQL
score_status=$?
set -e
wait "$withdraw_pid"
if [[ "$score_status" -eq 0 ]] || ! grep -q 'Withdrawn golfer cannot be scored' /tmp/elleng-score-race-d.log; then
  cat /tmp/elleng-score-race-c.log /tmp/elleng-score-race-d.log
  echo 'FAIL: withdrawal-first scenario allowed stale score' >&2
  exit 1
fi
psql -v ON_ERROR_STOP=1 -At -c "SELECT (state->'golfers'->14->>'participating')='false' FROM public.elleng_drafts WHERE id='elleng-cup';" | grep -qx t
echo 'PASS: withdrawal-first scenario rejects stale score'
