-- Disposable native PostgreSQL-only race model. Never apply to hosted Supabase.
BEGIN;
CREATE TABLE race_tournaments(id text PRIMARY KEY,team_count integer NOT NULL);
CREATE TABLE race_scores(tournament_id text NOT NULL REFERENCES race_tournaments(id),team_index integer NOT NULL,score integer NOT NULL);
INSERT INTO race_tournaments VALUES ('event',4);
CREATE FUNCTION pg_temp.lock_score_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
 SELECT team_count INTO v_count FROM race_tournaments
 WHERE id=NEW.tournament_id FOR UPDATE;
 IF v_count IS NULL OR NEW.team_index<0 OR NEW.team_index>=v_count
 THEN RAISE EXCEPTION 'Scoring team is not active' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER lock_score_parent BEFORE INSERT OR UPDATE ON race_scores
FOR EACH ROW EXECUTE FUNCTION pg_temp.lock_score_parent();
CREATE FUNCTION pg_temp.guard_team_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.team_count IS DISTINCT FROM OLD.team_count
 AND EXISTS(SELECT 1 FROM race_scores WHERE tournament_id=OLD.id)
 THEN RAISE EXCEPTION 'Cannot change team count after scoring' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_team_count BEFORE UPDATE OF team_count ON race_tournaments
FOR EACH ROW EXECUTE FUNCTION pg_temp.guard_team_count();
DO $$
DECLARE denied boolean:=false;
BEGIN
 INSERT INTO race_scores VALUES ('event',0,4);
 BEGIN UPDATE race_tournaments SET team_count=2 WHERE id='event';
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Team count changed despite saved score'; END IF;
 IF (SELECT team_count FROM race_tournaments WHERE id='event')<>4 THEN RAISE EXCEPTION 'Rejected update mutated tournament'; END IF;
 DELETE FROM race_scores;
 UPDATE race_tournaments SET team_count=2 WHERE id='event';
 denied:=false;
 BEGIN INSERT INTO race_scores VALUES ('event',3,5);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Removed team was able to score'; END IF;
 INSERT INTO race_scores VALUES ('event',1,4);
 RAISE NOTICE 'PASS: team-count guard and score-writer parent lock agree on active teams';
END $$;
ROLLBACK;
