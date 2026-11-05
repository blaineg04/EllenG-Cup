BEGIN;
DO $test$
DECLARE uid uuid; cid uuid; st jsonb; outstate jsonb; blocked boolean:=false;
BEGIN
 SELECT owner_id INTO uid FROM public.elleng_drafts WHERE id='elleng-cup';
 SELECT user_id INTO cid FROM public.elleng_captains WHERE draft_id='elleng-cup' AND team_index=0 LIMIT 1;
 st:=jsonb_build_object('teams',jsonb_build_array(jsonb_build_object('name','Team 1','roster','[]'::jsonb),jsonb_build_object('name','Team 2','roster','[]'::jsonb)),'golfers',jsonb_build_array(jsonb_build_object('name','Reserve','band','A','team',null,'participating',false),jsonb_build_object('name','First','band','C','team',null),jsonb_build_object('name','','team',null,'participating',false),jsonb_build_object('name','Last','band','C','team',null)),'picks','[]'::jsonb,'golferCount',4,'draftRules','open','draftType','snake','timerLength',60,'timerPaused',false,'timerEndsAt','2000-01-01T00:00:00Z');
 INSERT INTO public.elleng_drafts(id,owner_id,state,status) VALUES ('elleng-draft-scope-check',uid,st,'setup');
 INSERT INTO public.elleng_captains(draft_id,user_id,team_index,captain_name,captain_email) VALUES ('elleng-draft-scope-check',cid,0,'Test captain','scope-check@example.invalid');
 PERFORM set_config('request.jwt.claim.sub',cid::text,true);
 BEGIN PERFORM public.elleng_make_pick('elleng-draft-scope-check',0);EXCEPTION WHEN OTHERS THEN
 IF SQLERRM LIKE '%not playing%' THEN blocked:=true; ELSE RAISE; END IF;END;
 IF NOT blocked THEN RAISE EXCEPTION 'FAIL: nonplaying golfer could be drafted';END IF;
 outstate:=public.elleng_make_pick('elleng-draft-scope-check',3);
 IF outstate->'picks'->0->>'golfer'<>'3' THEN RAISE EXCEPTION 'Sparse active index was not picked';END IF;
 UPDATE public.elleng_drafts SET state=st WHERE id='elleng-draft-scope-check';
 PERFORM set_config('request.jwt.claim.sub',uid::text,true);
 outstate:=public.elleng_auto_pick('elleng-draft-scope-check');
 IF outstate->'picks'->0->>'golfer' NOT IN ('1','3') THEN RAISE EXCEPTION 'Autopick selected reserve';END IF;
 UPDATE public.elleng_drafts SET state=jsonb_set(outstate,'{timerEndsAt}','"2000-01-01T00:00:00Z"') WHERE id='elleng-draft-scope-check';
 outstate:=public.elleng_auto_pick('elleng-draft-scope-check');
 IF jsonb_array_length(outstate->'picks')<>2 THEN RAISE EXCEPTION 'Sparse active golfer not found';END IF;
 UPDATE public.elleng_drafts SET state=jsonb_set(outstate,'{timerEndsAt}','"2000-01-01T00:00:00Z"') WHERE id='elleng-draft-scope-check';
 outstate:=public.elleng_auto_pick('elleng-draft-scope-check');
 IF jsonb_array_length(outstate->'picks')<>2 THEN RAISE EXCEPTION 'Draft continued past active roster';END IF;
END $test$;
ROLLBACK;
