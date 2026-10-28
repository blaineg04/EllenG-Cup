-- Disposable role test: a score-writing captain may lack tournament UPDATE.
-- This is a deployment blocker for SECURITY INVOKER parent-row FOR UPDATE.
BEGIN;
CREATE ROLE elleng_fixture_scorer NOLOGIN;
CREATE TABLE elleng_fixture_tournaments(id text PRIMARY KEY,team_count integer NOT NULL);
INSERT INTO elleng_fixture_tournaments VALUES ('event',4);
GRANT USAGE ON SCHEMA public TO elleng_fixture_scorer;
GRANT SELECT ON elleng_fixture_tournaments TO elleng_fixture_scorer;
DO $$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  EXECUTE 'SET LOCAL ROLE elleng_fixture_scorer';
  PERFORM team_count FROM elleng_fixture_tournaments WHERE id='event' FOR UPDATE;
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 EXECUTE 'RESET ROLE';
 IF NOT denied THEN
  RAISE EXCEPTION 'Expected FOR UPDATE to require tournament UPDATE privileges';
 END IF;
 RAISE NOTICE 'PASS: SECURITY INVOKER score-lock rollout requires a role privilege redesign';
END $$;
ROLLBACK;
