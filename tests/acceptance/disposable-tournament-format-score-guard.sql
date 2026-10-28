-- DISPOSABLE ACCEPTANCE ONLY. Not an approved hosted migration.
-- Exercise team-score limits using the real tournament -> draft state join.
BEGIN;
CREATE TABLE elleng_range_drafts(id text PRIMARY KEY,state jsonb NOT NULL);
CREATE TABLE elleng_range_tournaments(id text PRIMARY KEY,draft_id text NOT NULL REFERENCES elleng_range_drafts(id));
CREATE TABLE elleng_range_team_scores(tournament_id text NOT NULL REFERENCES elleng_range_tournaments(id),team_index integer NOT NULL,hole integer NOT NULL,score integer NOT NULL,PRIMARY KEY(tournament_id,team_index,hole),CHECK(score BETWEEN 1 AND 40));
INSERT INTO elleng_range_drafts VALUES ('standard','{"playFormat":"elleng"}'),('split','{"playFormat":"split_pair"}');
INSERT INTO elleng_range_tournaments VALUES ('event-standard','standard'),('event-split','split');
-- Guard draft format changes when existing official totals would be invalid.
CREATE FUNCTION pg_temp.validate_elleng_draft_format_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_new_format text;
BEGIN
 v_new_format:=NEW.state->>'playFormat';
 IF v_new_format IS DISTINCT FROM OLD.state->>'playFormat'
 AND EXISTS(
  SELECT 1 FROM elleng_range_tournaments t
  JOIN elleng_range_team_scores s ON s.tournament_id=t.id
  WHERE t.draft_id=NEW.id
    AND ((v_new_format='split_pair' AND s.score NOT BETWEEN 2 AND 40)
      OR (v_new_format<>'split_pair' AND s.score NOT BETWEEN 1 AND 20))
 ) THEN
   RAISE EXCEPTION 'Cannot change tournament format with incompatible existing scores' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER prevent_invalid_format_change
BEFORE UPDATE OF state ON elleng_range_drafts
FOR EACH ROW EXECUTE FUNCTION pg_temp.validate_elleng_draft_format_change();
CREATE FUNCTION pg_temp.validate_elleng_score_format() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_format text;
BEGIN
 SELECT d.state->>'playFormat' INTO v_format
 FROM elleng_range_tournaments t JOIN elleng_range_drafts d ON d.id=t.draft_id
 WHERE t.id=NEW.tournament_id;
 IF v_format IS NULL THEN RAISE EXCEPTION 'Missing format' USING ERRCODE='23514'; END IF;
 IF (v_format='split_pair' AND NEW.score NOT BETWEEN 2 AND 40)
 OR (v_format<>'split_pair' AND NEW.score NOT BETWEEN 1 AND 20)
 THEN RAISE EXCEPTION 'Score outside tournament format limits' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER enforce_format_score BEFORE INSERT OR UPDATE ON elleng_range_team_scores
FOR EACH ROW EXECUTE FUNCTION pg_temp.validate_elleng_score_format();
DO $$
DECLARE denied boolean;
BEGIN
 INSERT INTO elleng_range_team_scores VALUES ('event-standard',0,1,20);
 INSERT INTO elleng_range_team_scores VALUES ('event-split',0,1,40);
 denied:=false;
 BEGIN INSERT INTO elleng_range_team_scores VALUES ('event-standard',0,2,40);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Standard insert of 40 bypassed guard'; END IF;
 denied:=false;
 BEGIN UPDATE elleng_range_team_scores SET tournament_id='event-standard' WHERE tournament_id='event-split';
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Cross-format UPDATE bypassed guard'; END IF;
 denied:=false;
 BEGIN INSERT INTO elleng_range_team_scores VALUES ('event-split',0,2,1);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Split-Pair score 1 bypassed guard'; END IF;
 -- A change to the draft format must not silently grandfather invalid totals.
 denied:=false;
 BEGIN
  UPDATE elleng_range_drafts SET state='{"playFormat":"elleng"}'::jsonb WHERE id='split';
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Draft format change accepted an incompatible existing 40-point score'; END IF;
 IF (SELECT state->>'playFormat' FROM elleng_range_drafts WHERE id='split')<>'split_pair'
 THEN RAISE EXCEPTION 'Denied format change mutated saved draft'; END IF;
 IF (SELECT score FROM elleng_range_team_scores WHERE tournament_id='event-split' AND hole=1)<>40
 THEN RAISE EXCEPTION 'Rejected UPDATE altered valid Split-Pair total'; END IF;
 -- Switching standard to Split-Pair must not retain a 1-point official total.
 UPDATE elleng_range_team_scores SET score=1 WHERE tournament_id='event-standard' AND hole=1;
 denied:=false;
 BEGIN
  UPDATE elleng_range_drafts SET state='{"playFormat":"split_pair"}'::jsonb WHERE id='standard';
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Standard-to-Split-Pair conversion accepted incompatible 1-point score'; END IF;
 IF (SELECT state->>'playFormat' FROM elleng_range_drafts WHERE id='standard')<>'elleng'
 THEN RAISE EXCEPTION 'Rejected Split-Pair conversion changed draft'; END IF;
 -- After correcting the score, the format switch is permitted.
 UPDATE elleng_range_team_scores SET score=2 WHERE tournament_id='event-standard' AND hole=1;
 UPDATE elleng_range_drafts SET state='{"playFormat":"split_pair"}'::jsonb WHERE id='standard';
 IF (SELECT state->>'playFormat' FROM elleng_range_drafts WHERE id='standard')<>'split_pair'
 THEN RAISE EXCEPTION 'Valid format switch unexpectedly rejected'; END IF;
 -- A real tournament can have pair/player detail that cannot be reinterpreted
 -- merely by switching the draft format. Probe that stricter rollout rule.
 CREATE TEMP TABLE elleng_range_pair_details(tournament_id text,score integer) ON COMMIT DROP;
 INSERT INTO elleng_range_pair_details VALUES ('event-split',12);
 denied:=false;
 BEGIN
  IF EXISTS (SELECT 1 FROM elleng_range_pair_details WHERE tournament_id='event-split')
  THEN RAISE EXCEPTION 'Format change requires clearing or reconciling pair details' USING ERRCODE='23514'; END IF;
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Pair detail reconciliation blocker not detected'; END IF;
 RAISE NOTICE 'PASS: tournament-linked guard enforces 20 standard / 40 Split-Pair for INSERT and UPDATE';
END $$;
ROLLBACK;
