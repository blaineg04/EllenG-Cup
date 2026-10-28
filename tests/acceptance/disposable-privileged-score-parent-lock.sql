-- Disposable only: prove SECURITY DEFINER trigger can lock a tournament row
-- without granting tournament UPDATE to the authenticated scoring role.
BEGIN;
CREATE ROLE elleng_lock_owner NOLOGIN;
CREATE ROLE elleng_lock_captain NOLOGIN;
CREATE TABLE elleng_lock_tournaments(id text PRIMARY KEY,team_count int NOT NULL);
CREATE TABLE elleng_lock_scores(tournament_id text,team_index int,score int);
INSERT INTO elleng_lock_tournaments VALUES ('event',2);
GRANT USAGE ON SCHEMA public TO elleng_lock_owner,elleng_lock_captain;
GRANT SELECT,UPDATE ON elleng_lock_tournaments TO elleng_lock_owner;
GRANT INSERT ON elleng_lock_scores TO elleng_lock_captain;
CREATE FUNCTION pg_temp.elleng_lock_test_trigger() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE team_limit int;
BEGIN
 SELECT team_count INTO team_limit FROM public.elleng_lock_tournaments
 WHERE id=NEW.tournament_id FOR UPDATE;
 IF team_limit IS NULL OR NEW.team_index<0 OR NEW.team_index>=team_limit THEN
  RAISE EXCEPTION 'Inactive team' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION pg_temp.elleng_lock_test_trigger() OWNER TO elleng_lock_owner;
CREATE TRIGGER guard_score BEFORE INSERT ON elleng_lock_scores
FOR EACH ROW EXECUTE FUNCTION pg_temp.elleng_lock_test_trigger();
SET LOCAL ROLE elleng_lock_captain;
INSERT INTO elleng_lock_scores VALUES ('event',1,4);
DO $
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  UPDATE public.elleng_lock_tournaments SET team_count=9 WHERE id='event';
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Captain received tournament administration privilege'; END IF;
END $;

DO $$
DECLARE denied boolean:=false;
BEGIN
 BEGIN INSERT INTO public.elleng_lock_scores VALUES ('event',3,4);
 EXCEPTION WHEN check_violation THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Inactive team accepted'; END IF;
END $$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM elleng_lock_scores)<>1 THEN
  RAISE EXCEPTION 'Score guard failed'; END IF;
 RAISE NOTICE 'PASS: authorized scorer can write score using privileged parent-lock trigger without tournament UPDATE';
END $$;
ROLLBACK;
