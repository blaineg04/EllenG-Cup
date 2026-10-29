#!/usr/bin/env bash
set -euo pipefail
export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGDATABASE=postgres
export PGPASSWORD=isolated-test-only
# The job starts with an empty disposable PostgreSQL service, never a hosted DB.
test "${GITHUB_ACTIONS:-}" = true || { echo "CI only"; exit 2; }
psql -X -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,status text NOT NULL,team_count integer NOT NULL);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text NOT NULL,hole integer NOT NULL,team_index integer NOT NULL,golfer_index integer NOT NULL,score integer NOT NULL CHECK(score BETWEEN 1 AND 20),updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tournament_id,hole,team_index,golfer_index));
CREATE TABLE public.elleng_team_scores(tournament_id text NOT NULL,team_index integer NOT NULL,hole integer NOT NULL,score integer CHECK(score BETWEEN 1 AND 20),updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tournament_id,team_index,hole));
INSERT INTO public.elleng_tournaments VALUES ('synthetic','live',2);
SQL
psql -X -v ON_ERROR_STOP=1 -f tests/acceptance/atomic-shamble-function-body.sql
# Two separate database sessions attempt writes to the same team/hole.
psql -X -v ON_ERROR_STOP=1 <<'SQL' &
BEGIN;
SELECT public.elleng_test_save_shamble_score('synthetic',0,10,0,3,ARRAY[0,1]);
SELECT pg_sleep(2);
COMMIT;
SQL
a=$!
sleep 0.3
psql -X -v ON_ERROR_STOP=1 <<'SQL' &
BEGIN;
SELECT public.elleng_test_save_shamble_score('synthetic',0,10,1,2,ARRAY[0,1]);
COMMIT;
SQL
b=$!
wait "$a"
wait "$b"
result="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT score FROM public.elleng_team_scores WHERE tournament_id='synthetic' AND team_index=0 AND hole=10")"
[[ "$result" == 2 ]] || { echo "FAIL: team low ball is $result, expected 2"; exit 1; }
echo "PASS: two simultaneous transactions converge to low ball 2"
