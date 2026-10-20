BEGIN;
DO $$
DECLARE before_state jsonb; after_state jsonb; again jsonb;
BEGIN
 -- A user who is neither commissioner nor captain cannot auto-pick.
 PERFORM set_config('elleng.test_uid','00000000-0000-0000-0000-000000000099',true);
 BEGIN
  PERFORM public.elleng_auto_pick('test-draft');
  RAISE EXCEPTION 'Unauthorized user was allowed to auto-pick';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM <> 'Not authorized for this draft' THEN RAISE; END IF;
 END;
 PERFORM set_config('elleng.test_uid','00000000-0000-0000-0000-000000000011',true);
 SELECT state INTO before_state FROM public.elleng_drafts WHERE id='test-draft';
 IF jsonb_array_length(before_state->'picks')<>3 THEN RAISE EXCEPTION 'Invalid draft fixture'; END IF;
 -- A paused clock must never take a pick.
 UPDATE public.elleng_drafts
 SET state=jsonb_set(state,'{timerPaused}','true'::jsonb)
 WHERE id='test-draft';
 SELECT public.elleng_auto_pick('test-draft') INTO again;
 IF jsonb_array_length(again->'picks')<>3 THEN RAISE EXCEPTION 'Paused draft was auto-picked'; END IF;
 -- A running clock that has not expired must not take a pick.
 UPDATE public.elleng_drafts
 SET state=jsonb_set(jsonb_set(state,'{timerPaused}','false'::jsonb),
 '{timerEndsAt}',to_jsonb((now()+interval '2 minutes')::text))
 WHERE id='test-draft';
 SELECT public.elleng_auto_pick('test-draft') INTO again;
 IF jsonb_array_length(again->'picks')<>3 THEN RAISE EXCEPTION 'Early auto-pick was allowed'; END IF;
 UPDATE public.elleng_drafts SET state=before_state WHERE id='test-draft';
 SELECT public.elleng_auto_pick('test-draft') INTO after_state;
 IF jsonb_array_length(after_state->'picks')<>4 THEN RAISE EXCEPTION 'Auto-pick did not advance exactly once'; END IF;
 IF (after_state->'golfers'->1->>'team')::integer<>0 THEN RAISE EXCEPTION 'Last remaining golfer not assigned to expected team'; END IF;
 IF (after_state->'picks'->3->>'auto')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Auto-pick marker missing'; END IF;
 IF (after_state->>'timerPaused')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Final draft pick left clock running'; END IF;
 IF after_state->>'timerEndsAt' IS NOT NULL THEN RAISE EXCEPTION 'Final draft pick left an active deadline'; END IF;
 IF jsonb_array_length(after_state->'teams'->0->'roster')<>3 THEN RAISE EXCEPTION 'Auto-pick roster not updated'; END IF;
 IF (SELECT count(*) FROM jsonb_array_elements(after_state->'teams'->0->'roster') r WHERE r::text='1')<>1
 THEN RAISE EXCEPTION 'Last golfer missing or duplicated in roster'; END IF;
 SELECT public.elleng_auto_pick('test-draft') INTO again;
 IF jsonb_array_length(again->'picks')<>4 THEN RAISE EXCEPTION 'Duplicate auto-pick occurred'; END IF;
END $$;
ROLLBACK;
