-- Disposable-only behavioral RLS test. Requires the proposed migration applied
-- to temporary tables and a local authenticated role; never run on Supabase.
GRANT SELECT ON public.elleng_tournaments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.elleng_team_scores TO authenticated;
CREATE POLICY "test score read" ON public.elleng_team_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "test captain insert" ON public.elleng_team_scores FOR INSERT TO authenticated
  WITH CHECK (current_setting('elleng.actor', true) = 'captain' AND team_index = 0);
CREATE POLICY "test captain update" ON public.elleng_team_scores FOR UPDATE TO authenticated
  USING (current_setting('elleng.actor', true) = 'captain' AND team_index = 0)
  WITH CHECK (current_setting('elleng.actor', true) = 'captain' AND team_index = 0);
CREATE POLICY "test captain delete" ON public.elleng_team_scores FOR DELETE TO authenticated
  USING (current_setting('elleng.actor', true) = 'captain' AND team_index = 0);
-- Commissioner can write any valid team while the tournament is live.
CREATE POLICY "test commissioner insert" ON public.elleng_team_scores FOR INSERT TO authenticated
  WITH CHECK (current_setting('elleng.actor', true) = 'commissioner');
CREATE POLICY "test commissioner update" ON public.elleng_team_scores FOR UPDATE TO authenticated
  USING (current_setting('elleng.actor', true) = 'commissioner')
  WITH CHECK (current_setting('elleng.actor', true) = 'commissioner');
CREATE POLICY "test commissioner delete" ON public.elleng_team_scores FOR DELETE TO authenticated
  USING (current_setting('elleng.actor', true) = 'commissioner');
INSERT INTO public.elleng_tournaments(id,team_count,status) VALUES
  ('rls-live',2,'live'),('rls-closed',2,'finalized');
-- Seed finalized score as privileged fixture setup, before assuming a user role.
INSERT INTO public.elleng_team_scores(tournament_id,team_index,score)
  VALUES ('rls-closed',1,7);
SET ROLE authenticated;
SELECT set_config('elleng.actor','outsider',false);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.elleng_team_scores(tournament_id,team_index,score)
      VALUES ('rls-live',0,5);
    RAISE EXCEPTION 'FAIL: unrelated authenticated user inserted a score';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
SELECT set_config('elleng.actor','captain',false);
INSERT INTO public.elleng_team_scores(tournament_id,team_index,score)
  VALUES ('rls-live',0,5);
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.elleng_team_scores(tournament_id,team_index,score)
      VALUES ('rls-live',1,5);
    RAISE EXCEPTION 'FAIL: captain inserted another team score';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.elleng_team_scores(tournament_id,team_index,score)
      VALUES ('rls-closed',0,5);
    RAISE EXCEPTION 'FAIL: captain inserted a finalized tournament score';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
SELECT set_config('elleng.actor','outsider',false);
DO $test$
DECLARE changed integer;
BEGIN
  UPDATE public.elleng_team_scores SET score=99 WHERE tournament_id='rls-live';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'FAIL: outsider updated % score rows', changed; END IF;
  DELETE FROM public.elleng_team_scores WHERE tournament_id='rls-live';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'FAIL: outsider deleted % score rows', changed; END IF;
END $test$;
SELECT set_config('elleng.actor','captain',false);
DO $test$
DECLARE changed integer;
BEGIN
  UPDATE public.elleng_team_scores SET score=6 WHERE tournament_id='rls-live';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'FAIL: captain could not update own score'; END IF;
  DELETE FROM public.elleng_team_scores WHERE tournament_id='rls-live';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'FAIL: captain could not delete own score'; END IF;
END $test$;
SELECT set_config('elleng.actor','commissioner',false);
INSERT INTO public.elleng_team_scores(tournament_id,team_index,score)
  VALUES ('rls-live',1,4);
DO $test$
DECLARE changed integer;
BEGIN
  UPDATE public.elleng_team_scores SET score=3 WHERE tournament_id='rls-live' AND team_index=1;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'FAIL: commissioner cannot update team 1'; END IF;
  BEGIN
    INSERT INTO public.elleng_team_scores(tournament_id,team_index,score) VALUES ('rls-closed',1,4);
    RAISE EXCEPTION 'FAIL: commissioner inserted finalized score';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.elleng_team_scores SET score=99 WHERE tournament_id='rls-closed';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'FAIL: commissioner updated finalized score'; END IF;
  DELETE FROM public.elleng_team_scores WHERE tournament_id='rls-closed';
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 0 THEN RAISE EXCEPTION 'FAIL: commissioner deleted finalized score'; END IF;
  DELETE FROM public.elleng_team_scores WHERE tournament_id='rls-live' AND team_index=1;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed <> 1 THEN RAISE EXCEPTION 'FAIL: commissioner cannot delete team 1'; END IF;
END $test$;
RESET ROLE;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.elleng_team_scores WHERE tournament_id='rls-live') THEN
    RAISE EXCEPTION 'FAIL: live disposable score rows remain after role tests';
  END IF;
  IF (SELECT score FROM public.elleng_team_scores WHERE tournament_id='rls-closed' AND team_index=1) IS DISTINCT FROM 7 THEN
    RAISE EXCEPTION 'FAIL: finalized score changed or disappeared';
  END IF;
END $test$;
