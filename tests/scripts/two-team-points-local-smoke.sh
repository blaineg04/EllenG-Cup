#!/usr/bin/env bash
# Opt-in LOCAL disposable PostgreSQL smoke test. Never supply production connection strings.
set -euo pipefail
if [[ "${ELLENG_RUN_LOCAL_DB_TESTS:-}" != "1" ]]; then
 echo "Set ELLENG_RUN_LOCAL_DB_TESTS=1 to run against an explicitly disposable local database" >&2
 exit 2
fi
if [[ -z "${ELLENG_LOCAL_DB_URL:-}" ]]; then
 echo "ELLENG_LOCAL_DB_URL must point to a disposable local PostgreSQL database" >&2
 exit 2
fi
case "$ELLENG_LOCAL_DB_URL" in
 postgresql://localhost/*|postgresql://127.0.0.1/*|postgres://localhost/*|postgres://127.0.0.1/*|postgresql://localhost:*/*|postgresql://127.0.0.1:*/*|postgres://localhost:*/*|postgres://127.0.0.1:*/*) ;;
 *) echo "Refusing non-loopback PostgreSQL URL" >&2; exit 2;;
esac
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
psql "$ELLENG_LOCAL_DB_URL" -X -v ON_ERROR_STOP=1 -f "$root/tests/sql/two-team-points-local-schema.sql"
psql "$ELLENG_LOCAL_DB_URL" -X -v ON_ERROR_STOP=1 -f "$root/tests/sql/two-team-points-local-save-score.sql"
psql "$ELLENG_LOCAL_DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
INSERT INTO elleng_points_dev.events(id,status) VALUES ('00000000-0000-0000-0000-000000000001','live');
INSERT INTO elleng_points_dev.teams(id,event_id,slot) VALUES
 ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','A'),
 ('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','B');
INSERT INTO elleng_points_dev.roster(event_id,team_id,player_id) VALUES
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000021'),
 ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000022');
DO $$
DECLARE rev bigint;
BEGIN
 SELECT elleng_points_dev.save_score('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000021',1,4,4,false,0) INTO rev;
 IF rev <> 1 THEN RAISE EXCEPTION 'revision not incremented'; END IF;
 BEGIN
  PERFORM elleng_points_dev.save_score('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000021',1,4,5,false,0);
  RAISE EXCEPTION 'stale revision accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
 END;
 BEGIN
  PERFORM elleng_points_dev.save_score('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000022',2,4,4,false,1);
  RAISE EXCEPTION 'wrong-team submission accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'golfer not assigned to team' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM elleng_points_dev.save_score('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000022',1,5,5,false,1);
  RAISE EXCEPTION 'conflicting par accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'conflicting hole par' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM elleng_points_dev.save_score('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000022',2,5,2,false,1);
  RAISE EXCEPTION 'unsupported albatross accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'better than eagle requires a points rule' THEN RAISE; END IF;
 END;
 IF (SELECT revision FROM elleng_points_dev.events WHERE id='00000000-0000-0000-0000-000000000001')<>1
 THEN RAISE EXCEPTION 'rejected submissions changed revision'; END IF;
 IF (SELECT strokes FROM elleng_points_dev.scores WHERE player_id='00000000-0000-0000-0000-000000000021')<>4
 THEN RAISE EXCEPTION 'stale update modified score'; END IF;
END $$;
ROLLBACK;
SQL
echo "Local score transaction smoke test passed (test data rolled back)"
