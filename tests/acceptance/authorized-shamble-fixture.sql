\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('elleng.test_uid',true),'')::uuid
$$;
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,owner_id uuid,state jsonb NOT NULL);
CREATE TABLE public.elleng_captains(draft_id text,user_id uuid,team_index integer);
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text,status text,team_count integer);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text,hole integer,team_index integer,golfer_index integer,score integer,updated_by uuid,updated_at timestamptz,PRIMARY KEY(tournament_id,hole,team_index,golfer_index));
CREATE TABLE public.elleng_team_scores(tournament_id text,team_index integer,hole integer,score integer,updated_by uuid,updated_at timestamptz,PRIMARY KEY(tournament_id,team_index,hole));
INSERT INTO public.elleng_drafts VALUES('draft','00000000-0000-4000-8000-000000000001','{"teams":[{"roster":[{"golferIndex":0,"name":"Test 1"},{"golferIndex":1,"name":"Test 2"}]},{"roster":[2,3]}]}'::jsonb);
INSERT INTO public.elleng_captains VALUES('draft','00000000-0000-4000-8000-000000000002',0);
INSERT INTO public.elleng_tournaments VALUES('fixture','draft','live',2);
\i tests/acceptance/authorized-shamble-rpc-proposal.sql
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000002',false);
DO $check$
DECLARE v integer; denied boolean;
BEGIN
 denied:=false;
 BEGIN
   PERFORM public.elleng_test_authorized_shamble('fixture',0,NULL,0,NULL);
 EXCEPTION WHEN invalid_parameter_value THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Missing hole unexpectedly accepted'; END IF;
 v:=public.elleng_test_authorized_shamble('fixture',0,10,0,4);
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Incomplete roster scored'; END IF;
 v:=public.elleng_test_authorized_shamble('fixture',0,10,1,2);
 IF v<>2 THEN RAISE EXCEPTION 'Expected team low score 2, got %',v; END IF;
 denied:=false;
 BEGIN
   PERFORM public.elleng_test_authorized_shamble('fixture',1,10,2,3);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Other team write unexpectedly succeeded'; END IF;
 denied:=false;
 BEGIN
   PERFORM public.elleng_test_authorized_shamble('fixture',0,10,3,3);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Non-rostered golfer unexpectedly accepted'; END IF;
 RAISE NOTICE 'PASS: assigned captain, derived score, other team and roster guards';
END $check$;
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000003',false);
DO $check$
DECLARE denied boolean:=false;
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_shamble('fixture',0,10,0,3);
 EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'Unauthorized account accepted'; END IF;
 RAISE NOTICE 'PASS: unrelated authenticated identity rejected';
END $check$;
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000001',false);
DO $check$
BEGIN
 IF public.elleng_test_authorized_shamble('fixture',0,10,0,3)<>2
 THEN RAISE EXCEPTION 'Commissioner write failed'; END IF;
 RAISE NOTICE 'PASS: commissioner authorized';
END $check$;
-- Execute scoring updates and score clearing against disposable PostgreSQL rows.
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000002',false);
DO $score_lifecycle$
DECLARE v integer; blocked boolean;
BEGIN
 v:=public.elleng_test_authorized_shamble('fixture',0,10,1,5);
 IF v<>3 THEN RAISE EXCEPTION 'Team minimum did not recalculate after update: %',v; END IF;
 v:=public.elleng_test_authorized_shamble('fixture',0,10,0,NULL);
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Cleared player score left an official team score'; END IF;
 IF EXISTS (SELECT 1 FROM public.elleng_team_scores
            WHERE tournament_id='fixture' AND team_index=0 AND hole=10)
 THEN RAISE EXCEPTION 'Stale team score row survived incomplete Shamble roster'; END IF;
 v:=public.elleng_test_authorized_shamble('fixture',0,10,0,6);
 IF v<>5 THEN RAISE EXCEPTION 'Restored roster did not recalculate team score: %',v; END IF;
 UPDATE public.elleng_tournaments SET status='completed' WHERE id='fixture';
 blocked:=false;
 BEGIN
   PERFORM public.elleng_test_authorized_shamble('fixture',0,11,0,4);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Completed tournament accepted Shamble scoring'; END IF;
 UPDATE public.elleng_tournaments SET status='live' WHERE id='fixture';
 RAISE NOTICE 'PASS: update, clear, resume and completed-event scoring guard';
END $score_lifecycle$;
-- Adversarial roster cases: invalid assignments must not quietly shrink the
-- team or cause an incorrect low-ball score.
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000001',false);
DO $negative$
DECLARE blocked boolean;
BEGIN
 UPDATE public.elleng_drafts SET state=jsonb_set(state,'{teams,0,roster}',
  '[{"golferIndex":0},{"golferIndex":0}]'::jsonb) WHERE id='draft';
 blocked:=false;
 BEGIN
  PERFORM public.elleng_test_authorized_shamble('fixture',0,10,0,3);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Duplicate roster accepted'; END IF;
 UPDATE public.elleng_drafts SET state=jsonb_set(state,'{teams,0,roster}',
  '[{"golferIndex":0},{"bad":1}]'::jsonb) WHERE id='draft';
 blocked:=false;
 BEGIN
  PERFORM public.elleng_test_authorized_shamble('fixture',0,10,0,3);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Malformed roster accepted'; END IF;
 RAISE NOTICE 'PASS: duplicate and malformed roster denied';
END $negative$;
SELECT set_config('elleng.test_uid','',false);
DO $anonymous$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_shamble('fixture',0,10,0,3);
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Unauthenticated scoring accepted'; END IF;
 RAISE NOTICE 'PASS: unauthenticated scoring rejected';
END $anonymous$;
ROLLBACK;

