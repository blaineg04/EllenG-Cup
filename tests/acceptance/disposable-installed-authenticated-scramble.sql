-- Isolated post-install RPC behavior; never run against hosted Supabase.
INSERT INTO public.elleng_drafts(id,owner_id,state)
VALUES ('auth-trial','11111111-1111-4111-8111-111111111111',
'{"playFormat":"standard","teams":[{"roster":[0]},{"roster":[1]}]}'::jsonb);
INSERT INTO public.elleng_tournaments(id,draft_id,status,team_count)
VALUES ('auth-tournament','auth-trial','live',2);
INSERT INTO public.elleng_captains(draft_id,user_id,team_index)
VALUES ('auth-trial','22222222-2222-4222-8222-222222222222',0);
-- A captain may score only their own team.
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT public.elleng_test_authorized_scramble('auth-tournament',0,1,4);
DO $test$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.elleng_team_scores
  WHERE tournament_id='auth-tournament' AND team_index=0 AND hole=1
   AND score=4 AND updated_by='22222222-2222-4222-8222-222222222222'::uuid)
 THEN RAISE EXCEPTION 'Captain score not persisted'; END IF;
END $test$;
-- A non-captain cannot score; an authorization failure must be raised.
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $test$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_scramble('auth-tournament',0,2,5);
  RAISE EXCEPTION 'Unauthorized score accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF EXISTS (SELECT 1 FROM public.elleng_team_scores WHERE tournament_id='auth-tournament' AND hole=2)
 THEN RAISE EXCEPTION 'Unauthorized score persisted'; END IF;
END $test$;
-- Draft owner can score any team.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT public.elleng_test_authorized_scramble('auth-tournament',1,1,3);
DO $test$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.elleng_team_scores
 WHERE tournament_id='auth-tournament' AND team_index=1 AND hole=1 AND score=3)
 THEN RAISE EXCEPTION 'Commissioner score not persisted'; END IF;
END $test$;
