\set ON_ERROR_STOP on
DO $role$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
DO $role$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY, owner_id uuid, state jsonb NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY, draft_id text, status text);
CREATE TABLE public.elleng_team_scores(tournament_id text);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text, golfer_index integer, team_index integer, hole integer, score integer);
CREATE TABLE public.elleng_pair_hole_scores(tournament_id text);
CREATE TABLE public.elleng_group_assignments(draft_id text);
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.elleng_tournaments VALUES('elleng-cup-live','elleng-cup','setup');
INSERT INTO public.elleng_drafts
SELECT 'elleng-cup','11111111-1111-4111-8111-111111111111'::uuid,
 jsonb_build_object('draftRules','weighted','playFormat','shamble_points',
 'golfers',(SELECT jsonb_agg(jsonb_build_object('name',CASE WHEN i=0 THEN 'Captain A' WHEN i=12 THEN 'Captain B' ELSE 'Golfer '||i END,'team',CASE WHEN i<12 THEN 0 ELSE 1 END,'participating',true,'late_added',i=23) ORDER BY i) FROM generate_series(0,23) i),
 'teams',jsonb_build_array(jsonb_build_object('captain','Captain A','roster',(SELECT jsonb_agg(i ORDER BY i) FROM generate_series(0,11) i)),jsonb_build_object('captain','Captain B','roster',(SELECT jsonb_agg(i ORDER BY i) FROM generate_series(12,23) i))),
 'picks',(SELECT jsonb_agg(jsonb_build_object('golfer',i) ORDER BY i) FROM generate_series(0,22) i)),
 now();
\i db/releases/withdraw-golfer/guard-staged.sql
CREATE TRIGGER guard_draft BEFORE UPDATE ON public.elleng_drafts FOR EACH ROW EXECUTE FUNCTION public.elleng_guard_weighted_roster();
\i db/releases/withdraw-golfer/staged.sql
\i db/releases/withdraw-golfer/restore-staged.sql
\i db/releases/withdraw-golfer/score-guard-staged.sql
DO $$
DECLARE stamp timestamptz; result jsonb; state_before jsonb;
BEGIN
 SELECT updated_at,state INTO stamp,state_before FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,13,'test');
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Withdrawal failed'; END IF;
 IF (SELECT state->'picks' FROM public.elleng_drafts WHERE id='elleng-cup') IS DISTINCT FROM state_before->'picks' THEN RAISE EXCEPTION 'Picks changed'; END IF;
 IF (SELECT state->'teams' FROM public.elleng_drafts WHERE id='elleng-cup') IS DISTINCT FROM state_before->'teams' THEN RAISE EXCEPTION 'Teams changed'; END IF;
 BEGIN
  INSERT INTO public.elleng_player_hole_scores VALUES('elleng-cup-live',13,1,1,4);
  RAISE EXCEPTION 'Withdrawn golfer score unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,13);
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Restore failed'; END IF;
 IF (SELECT state->'golfers'->13->>'participating' FROM public.elleng_drafts WHERE id='elleng-cup')<>'true' THEN RAISE EXCEPTION 'Restore did not reactivate golfer'; END IF;
 -- Repeating a successful restore must fail without changing the draft.
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 BEGIN
   PERFORM public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,13);
   RAISE EXCEPTION 'Duplicate restoration unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Duplicate restoration unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Golfer is not withdrawn%' THEN RAISE; END IF;
 END;
 -- Repeating a withdrawal must also fail without changing the draft.
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 PERFORM public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,18,'duplicate-check');
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 BEGIN
   PERFORM public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,18,'duplicate-check');
   RAISE EXCEPTION 'Duplicate withdrawal unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Duplicate withdrawal unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Golfer not active%' THEN RAISE; END IF;
 END;
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 PERFORM public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,18);
 -- The 24th golfer was added after the 23-pick draft; withdrawing and
 -- restoring that golfer must not require an additional draft pick.
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,23,'late-addition');
 IF result->>'ok'<>'true' OR
 (SELECT state#>>'{golfers,23,participating}' FROM public.elleng_drafts WHERE id='elleng-cup')<>'false'
 THEN RAISE EXCEPTION 'Late-added golfer withdrawal failed'; END IF;
 -- Late-added withdrawn golfers must also be blocked from scoring.
 BEGIN
   INSERT INTO public.elleng_player_hole_scores VALUES('elleng-cup-live',23,1,1,4);
   RAISE EXCEPTION 'Late-added withdrawn golfer scored unexpectedly';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF (SELECT jsonb_array_length(state->'picks') FROM public.elleng_drafts WHERE id='elleng-cup')<>23
 THEN RAISE EXCEPTION 'Late addition altered draft picks'; END IF;
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,23);
 IF result->>'ok'<>'true' OR
 (SELECT state#>>'{golfers,23,participating}' FROM public.elleng_drafts WHERE id='elleng-cup')<>'true'
 THEN RAISE EXCEPTION 'Late-added golfer restore failed'; END IF;
 IF (SELECT state->'teams' FROM public.elleng_drafts WHERE id='elleng-cup') IS DISTINCT FROM state_before->'teams'
 THEN RAISE EXCEPTION 'Late-added golfer restore altered team rosters'; END IF;
 -- Restoring a golfer must permit normal scoring again.
 INSERT INTO public.elleng_player_hole_scores VALUES('elleng-cup-live',13,1,1,4);
 IF (SELECT count(*) FROM public.elleng_player_hole_scores
     WHERE tournament_id='elleng-cup-live' AND golfer_index=13)<>1
 THEN RAISE EXCEPTION 'Restored golfer cannot score'; END IF;
 DELETE FROM public.elleng_player_hole_scores
 WHERE tournament_id='elleng-cup-live' AND golfer_index=13;
 -- Sequential withdrawals must preserve all original draft picks and team rosters.
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,14,'first');
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,15,'second');
 IF (SELECT state->'picks' FROM public.elleng_drafts WHERE id='elleng-cup') IS DISTINCT FROM state_before->'picks'
 OR (SELECT state->'teams' FROM public.elleng_drafts WHERE id='elleng-cup') IS DISTINCT FROM state_before->'teams'
 THEN RAISE EXCEPTION 'Sequential withdrawal changed historical draft'; END IF;
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,15);
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,14);
 -- Ordinary non-roster state updates must continue to work after the draft.
 -- This protects existing commissioner and scoring-adjacent metadata workflows.
 UPDATE public.elleng_drafts
 SET state=jsonb_set(state,'{withdrawal_test_metadata}','"preserved"'::jsonb)
 WHERE id='elleng-cup';
 IF (SELECT state->>'withdrawal_test_metadata' FROM public.elleng_drafts WHERE id='elleng-cup')<>'preserved'
 THEN RAISE EXCEPTION 'Non-roster state update unexpectedly blocked'; END IF;
 -- A direct roster mutation must not bypass the completed-draft guard.
 BEGIN
   UPDATE public.elleng_drafts SET state=jsonb_set(state,'{golfers,13,name}','"Tampered Name"'::jsonb)
   WHERE id='elleng-cup';
   RAISE EXCEPTION 'Direct roster mutation unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Direct roster mutation unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Completed draft golfer changes%' AND SQLERRM NOT LIKE '%Unauthorized roster change%'
   THEN RAISE; END IF;
 END;
 -- Direct updates cannot bypass the RPC to withdraw a captain.
 BEGIN
   UPDATE public.elleng_drafts
   SET state=jsonb_set(state,'{golfers,0}',(state#>'{golfers,0}') ||
      jsonb_build_object('participating',false,'withdrawn',true,'withdrawn_at',clock_timestamp()))
   WHERE id='elleng-cup';
   RAISE EXCEPTION 'Direct captain withdrawal unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Direct captain withdrawal unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Captain withdrawal%' THEN RAISE; END IF;
 END;
 -- Direct updates cannot withdraw two golfers in one write.
 BEGIN
   UPDATE public.elleng_drafts SET state=jsonb_set(
      jsonb_set(state,'{golfers,13}',(state#>'{golfers,13}') ||
         jsonb_build_object('participating',false,'withdrawn',true,'withdrawn_at',clock_timestamp())),
      '{golfers,14}',(state#>'{golfers,14}') ||
         jsonb_build_object('participating',false,'withdrawn',true,'withdrawn_at',clock_timestamp()))
   WHERE id='elleng-cup';
   RAISE EXCEPTION 'Bulk direct withdrawal unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Bulk direct withdrawal unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Unauthorized roster change%' THEN RAISE; END IF;
 END;
 -- Captain protection must reject an otherwise valid withdrawal.
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 BEGIN
   PERFORM public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,0,'captain');
   RAISE EXCEPTION 'Captain withdrawal unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Captain withdrawal unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Captain withdrawal%' THEN RAISE; END IF;
 END;
 -- Stale commissioner clients must not overwrite a newer draft revision.
 BEGIN
   PERFORM public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp - interval '1 second',13,'stale');
   RAISE EXCEPTION 'Stale withdrawal unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Stale withdrawal unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Tournament changed%' THEN RAISE; END IF;
 END;
 -- A signed-in non-commissioner must not be allowed to withdraw a golfer.
 PERFORM set_config('test.uid','22222222-2222-4222-8222-222222222222',true);
 BEGIN
   PERFORM public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,13,'unauthorized');
   RAISE EXCEPTION 'Unauthorized withdrawal unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Unauthorized withdrawal unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Commissioner access required%' THEN RAISE; END IF;
 END;
 -- A non-commissioner must also be unable to restore an already withdrawn golfer.
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 PERFORM set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
 PERFORM public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,17,'restore-auth-check');
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 PERFORM set_config('test.uid','22222222-2222-4222-8222-222222222222',true);
 BEGIN
   PERFORM public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,17);
   RAISE EXCEPTION 'Unauthorized restoration unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Unauthorized restoration unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Commissioner access required%' THEN RAISE; END IF;
 END;
 PERFORM set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
 PERFORM public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,17);
 -- Withdraw another golfer before scoring so restore lockout is tested against a valid withdrawn target.
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,16,'restore-lockout');
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 -- Once any player score exists, withdrawals must be rejected.
 INSERT INTO public.elleng_player_hole_scores VALUES('elleng-cup-live',13,1,1,4);
 BEGIN
   PERFORM public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,13,'too late');
   RAISE EXCEPTION 'Withdrawal after scoring unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Withdrawal after scoring unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Scores exist%' THEN RAISE; END IF;
 END;
 -- Restore must also be locked after scoring starts.
 BEGIN
   PERFORM public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,16);
   RAISE EXCEPTION 'Restore after scoring unexpectedly allowed';
 EXCEPTION WHEN OTHERS THEN
   IF SQLERRM='Restore after scoring unexpectedly allowed' THEN RAISE; END IF;
   IF SQLERRM NOT LIKE '%Scores exist%'
   THEN RAISE; END IF;
 END;

END $$;
