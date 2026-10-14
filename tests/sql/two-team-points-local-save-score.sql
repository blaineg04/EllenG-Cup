-- LOCAL/DISPOSABLE PostgreSQL ONLY. Requires two-team-points-local-schema.sql.
-- Transactional optimistic concurrency prototype; caller authorization is NOT implemented.
CREATE OR REPLACE FUNCTION elleng_points_dev.save_score(
 p_event uuid,p_team uuid,p_player uuid,p_hole smallint,p_par smallint,
 p_strokes smallint,p_pickup boolean,p_expected_revision bigint
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_status text; v_revision bigint; v_known_par smallint;
BEGIN
 SELECT status,revision INTO v_status,v_revision
 FROM elleng_points_dev.events WHERE id=p_event FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'event not found'; END IF;
 IF v_revision IS DISTINCT FROM p_expected_revision THEN
  RAISE EXCEPTION 'stale revision' USING ERRCODE='40001';
 END IF;
 IF v_status <> 'live' THEN RAISE EXCEPTION 'event not live'; END IF;
 IF NOT EXISTS (SELECT 1 FROM elleng_points_dev.roster
  WHERE event_id=p_event AND team_id=p_team AND player_id=p_player) THEN
  RAISE EXCEPTION 'golfer not assigned to team';
 END IF;
 IF p_hole IS NULL OR p_par IS NULL OR
    p_hole NOT BETWEEN 1 AND 18 OR p_par NOT BETWEEN 3 AND 5 OR
    p_pickup IS NULL OR
    NOT ((p_pickup AND p_strokes IS NULL) OR
         (NOT p_pickup AND p_strokes BETWEEN 1 AND 99)) THEN
  RAISE EXCEPTION 'invalid score input';
 END IF;
 IF NOT p_pickup AND p_strokes <> 1 AND p_strokes < p_par - 2 THEN
  RAISE EXCEPTION 'better than eagle requires a points rule';
 END IF;
 SELECT par INTO v_known_par FROM elleng_points_dev.scores
  WHERE event_id=p_event AND hole=p_hole LIMIT 1;
 IF v_known_par IS NOT NULL AND v_known_par <> p_par THEN
  RAISE EXCEPTION 'conflicting hole par';
 END IF;
 INSERT INTO elleng_points_dev.scores(event_id,team_id,player_id,hole,par,strokes,pickup)
 VALUES(p_event,p_team,p_player,p_hole,p_par,p_strokes,p_pickup)
 ON CONFLICT(event_id,player_id,hole)
 DO UPDATE SET par=excluded.par,strokes=excluded.strokes,pickup=excluded.pickup
 WHERE elleng_points_dev.scores.team_id=excluded.team_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'team reassignment prohibited'; END IF;
 UPDATE elleng_points_dev.events SET revision=revision+1 WHERE id=p_event
 RETURNING revision INTO v_revision;
 RETURN v_revision;
END $$;
-- Never grant EXECUTE to app users until authorization is implemented and reviewed.
REVOKE ALL ON FUNCTION elleng_points_dev.save_score(uuid,uuid,uuid,smallint,smallint,smallint,boolean,bigint) FROM PUBLIC;
