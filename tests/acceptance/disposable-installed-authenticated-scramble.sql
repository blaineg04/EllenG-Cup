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

-- A captain cannot write to another captain's team.
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $test$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_scramble('auth-tournament',1,2,5);
  RAISE EXCEPTION 'Cross-team captain write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF EXISTS (SELECT 1 FROM public.elleng_team_scores
 WHERE tournament_id='auth-tournament' AND team_index=1 AND hole=2)
 THEN RAISE EXCEPTION 'Cross-team captain write persisted'; END IF;
END $test$;
-- Missing JWT subject must not be treated as a privileged user.
SELECT set_config('request.jwt.claim.sub','',false);
DO $test$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_scramble('auth-tournament',0,3,5);
  RAISE EXCEPTION 'Unauthenticated score accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF EXISTS (SELECT 1 FROM public.elleng_team_scores
 WHERE tournament_id='auth-tournament' AND hole=3)
 THEN RAISE EXCEPTION 'Unauthenticated score persisted'; END IF;
END $test$;

-- Only the draft owner can reset the tournament's scores.
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $test$
BEGIN
 BEGIN
  PERFORM public.elleng_test_commissioner_clear_scores('auth-tournament');
  RAISE EXCEPTION 'Captain was permitted to reset tournament scores';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF (SELECT count(*) FROM public.elleng_team_scores WHERE tournament_id='auth-tournament')<>2
 THEN RAISE EXCEPTION 'Rejected captain reset modified scores'; END IF;
END $test$;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $test$
DECLARE deleted_count integer;
BEGIN
 deleted_count:=public.elleng_test_commissioner_clear_scores('auth-tournament');
 IF deleted_count<>2 THEN RAISE EXCEPTION 'Commissioner reset count incorrect: %',deleted_count; END IF;
 IF EXISTS (SELECT 1 FROM public.elleng_team_scores WHERE tournament_id='auth-tournament')
 THEN RAISE EXCEPTION 'Commissioner reset left team scores'; END IF;
END $test$;

-- Installed Shamble RPC: one-golfer roster is complete after one score.
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $test$
DECLARE team_total integer;
BEGIN
 team_total:=public.elleng_test_authorized_shamble('auth-tournament',0,10,0,5);
 IF team_total<>5 THEN RAISE EXCEPTION 'Shamble total mismatch: %',team_total; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.elleng_player_hole_scores
 WHERE tournament_id='auth-tournament' AND team_index=0 AND hole=10
 AND golfer_index=0 AND score=5)
 THEN RAISE EXCEPTION 'Shamble golfer score not saved'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.elleng_team_scores
 WHERE tournament_id='auth-tournament' AND team_index=0 AND hole=10 AND score=5)
 THEN RAISE EXCEPTION 'Shamble team total not saved'; END IF;
END $test$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $test$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_shamble('auth-tournament',0,11,0,4);
  RAISE EXCEPTION 'Unauthorized Shamble write accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF EXISTS (SELECT 1 FROM public.elleng_player_hole_scores
 WHERE tournament_id='auth-tournament' AND hole=11)
 THEN RAISE EXCEPTION 'Unauthorized Shamble write persisted'; END IF;
END $test$;

-- Installed Split-Pair RPC: only a complete pair of pair-scores creates a team total.
INSERT INTO public.elleng_drafts(id,owner_id,state) VALUES
('pair-auth-trial','11111111-1111-4111-8111-111111111111',
'{"playFormat":"split_pair","golfers":[{"name":"A"},{"name":"B"},{"name":"C"},{"name":"D"}],"teams":[{"roster":[0,1,2,3]}]}'::jsonb);
INSERT INTO public.elleng_tournaments(id,draft_id,status,team_count)
VALUES ('pair-auth-tournament','pair-auth-trial','live',1);
INSERT INTO public.elleng_captains(draft_id,user_id,team_index)
VALUES ('pair-auth-trial','22222222-2222-4222-8222-222222222222',0);
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT public.elleng_test_authorized_split_pair('pair-auth-tournament',0,1,0,5);
DO $test$
BEGIN
 IF EXISTS (SELECT 1 FROM public.elleng_team_scores
 WHERE tournament_id='pair-auth-tournament' AND hole=1)
 THEN RAISE EXCEPTION 'Incomplete Split-Pair incorrectly created team score'; END IF;
END $test$;
SELECT public.elleng_test_authorized_split_pair('pair-auth-tournament',0,1,1,6);
DO $test$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.elleng_team_scores
 WHERE tournament_id='pair-auth-tournament' AND hole=1 AND score=11)
 THEN RAISE EXCEPTION 'Completed Split-Pair total not saved'; END IF;
END $test$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $test$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_split_pair('pair-auth-tournament',0,2,0,5);
  RAISE EXCEPTION 'Unauthorized Split-Pair write accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Unauthorized Split-Pair write accepted' THEN RAISE; END IF;
 END;
 IF EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores
 WHERE tournament_id='pair-auth-tournament' AND hole=2)
 THEN RAISE EXCEPTION 'Unauthorized Split-Pair write persisted'; END IF;
END $test$;
