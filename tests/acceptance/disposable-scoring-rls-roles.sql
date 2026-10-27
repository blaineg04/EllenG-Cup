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
INSERT INTO public.elleng_tournaments(id,team_count,status) VALUES
  ('rls-live',2,'live'),('rls-closed',2,'finalized');
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
RESET ROLE;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.elleng_team_scores WHERE tournament_id LIKE 'rls-%') THEN
    RAISE EXCEPTION 'FAIL: disposable score rows remain after role tests';
  END IF;
END $test$;
