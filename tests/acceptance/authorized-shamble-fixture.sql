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
DECLARE v integer;
BEGIN
 v:=public.elleng_test_authorized_shamble('fixture',0,10,0,4);
 IF v IS NOT NULL THEN RAISE EXCEPTION 'Incomplete roster scored'; END IF;
 v:=public.elleng_test_authorized_shamble('fixture',0,10,1,2);
 IF v<>2 THEN RAISE EXCEPTION 'Expected team low score 2, got %',v; END IF;
 BEGIN
   PERFORM public.elleng_test_authorized_shamble('fixture',1,10,2,3);
   RAISE EXCEPTION 'Other team write unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   PERFORM public.elleng_test_authorized_shamble('fixture',0,10,3,3);
   RAISE EXCEPTION 'Non-rostered golfer unexpectedly accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: assigned captain, derived score, other team and roster guards';
END $check$;
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000003',false);
DO $check$
BEGIN
 BEGIN
  PERFORM public.elleng_test_authorized_shamble('fixture',0,10,0,3);
  RAISE EXCEPTION 'Unauthorized account accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'PASS: unrelated authenticated identity rejected';
END $check$;
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000001',false);
DO $check$
BEGIN
 IF public.elleng_test_authorized_shamble('fixture',0,10,0,3)<>2
 THEN RAISE EXCEPTION 'Commissioner write failed'; END IF;
 RAISE NOTICE 'PASS: commissioner authorized';
END $check$;
ROLLBACK;
