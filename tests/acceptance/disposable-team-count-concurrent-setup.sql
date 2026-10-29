-- Disposable PostgreSQL only. Dedicated short-lived database; never hosted.
CREATE TABLE race_tournaments(id text PRIMARY KEY,team_count integer NOT NULL);
CREATE TABLE race_scores(tournament_id text NOT NULL REFERENCES race_tournaments(id),team_index integer NOT NULL,score integer NOT NULL);
INSERT INTO race_tournaments VALUES ('event',4);
CREATE FUNCTION race_lock_score_parent() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
 SELECT team_count INTO v_count FROM race_tournaments WHERE id=NEW.tournament_id FOR UPDATE;
 IF v_count IS NULL OR NEW.team_index<0 OR NEW.team_index>=v_count
 THEN RAISE EXCEPTION 'Inactive team score' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER race_lock_score_parent BEFORE INSERT OR UPDATE ON race_scores
FOR EACH ROW EXECUTE FUNCTION race_lock_score_parent();
CREATE FUNCTION race_guard_team_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.team_count IS DISTINCT FROM OLD.team_count
 AND EXISTS(SELECT 1 FROM race_scores WHERE tournament_id=OLD.id)
 THEN RAISE EXCEPTION 'Existing score blocks team-count change' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER race_guard_team_count BEFORE UPDATE OF team_count ON race_tournaments
FOR EACH ROW EXECUTE FUNCTION race_guard_team_count();
