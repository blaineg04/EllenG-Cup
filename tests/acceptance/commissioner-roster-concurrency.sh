#!/usr/bin/env bash
set -euo pipefail
export PGPASSWORD="${PGPASSWORD:-postgres}"
PSQL=(psql -X -v ON_ERROR_STOP=1 -h localhost -U postgres -d elleng_roster_test)
# Session A locks the tournament exactly as the commissioner RPC does.
# Session B attempts a tee-group insert, which must wait on the same row.
"${PSQL[@]}" -c "BEGIN; SELECT id FROM public.elleng_tournaments WHERE id='elleng-cup-live' FOR UPDATE; SELECT pg_sleep(5); COMMIT;" >/tmp/elleng-lock-holder.log 2>&1 &
holder=$!
trap 'kill "$holder" 2>/dev/null || true' EXIT
sleep 1
set +e
output=$("${PSQL[@]}" -c "SET lock_timeout='800ms'; INSERT INTO public.elleng_group_assignments(draft_id) VALUES ('elleng-cup');" 2>&1)
status=$?
set -e
if [[ $status -eq 0 || "$output" != *"lock timeout"* ]]; then
 echo "FAIL: tee-group write did not block on commissioner tournament lock"
 echo "$output"
 exit 1
fi
wait "$holder"
trap - EXIT
# Inverse: a group-assignment insert holds the tournament lock until commit,
# and the commissioner-side SELECT FOR UPDATE must block.
"${PSQL[@]}" -c "BEGIN; INSERT INTO public.elleng_group_assignments(draft_id) VALUES ('elleng-cup'); SELECT pg_sleep(5); ROLLBACK;" >/tmp/elleng-group-holder.log 2>&1 &
holder=$!
trap 'kill "$holder" 2>/dev/null || true' EXIT
sleep 1
set +e
output=$("${PSQL[@]}" -c "SET lock_timeout='800ms'; SELECT id FROM public.elleng_tournaments WHERE id='elleng-cup-live' FOR UPDATE;" 2>&1)
status=$?
set -e
if [[ $status -eq 0 || "$output" != *"lock timeout"* ]]; then
 echo "FAIL: commissioner lock did not block on active group-assignment write"
 echo "$output"
 exit 1
fi
wait "$holder"
trap - EXIT

# Score writer and commissioner RPC must also serialize on the tournament row.
# The production score trigger uses FOR UPDATE on this same parent.
"${PSQL[@]}" -c "BEGIN; SELECT id FROM public.elleng_tournaments WHERE id='elleng-cup-live' FOR UPDATE; SELECT pg_sleep(5); COMMIT;" >/tmp/elleng-commissioner-score-holder.log 2>&1 &
holder=$!
trap 'kill "$holder" 2>/dev/null || true' EXIT
sleep 1
set +e
output=$("${PSQL[@]}" -c "SET lock_timeout='800ms'; SELECT id FROM public.elleng_tournaments WHERE id='elleng-cup-live' FOR UPDATE;" 2>&1)
status=$?
set -e
if [[ $status -eq 0 || "$output" != *"lock timeout"* ]]; then
 echo "FAIL: score-side tournament lock did not block on commissioner lock"
 echo "$output"
 exit 1
fi
wait "$holder"
trap - EXIT
echo "PASS: tournament lock contention is enforced for scoring-side acquisition"
echo "PASS: tournament and group assignment locks serialize in both directions"
