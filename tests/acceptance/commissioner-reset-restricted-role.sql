\set ON_ERROR_STOP on
BEGIN;
DO $roles$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
END $roles$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $uid$
 SELECT nullif(current_setting('elleng.test_uid',true),'')::uuid
$uid$;
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,owner_id uuid,state jsonb);
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text,status text,team_count integer);
CREATE TABLE public.elleng_captains(draft_id text,user_id uuid,team_index integer);
CREATE TABLE public.elleng_team_scores(tournament_id text,team_index integer,hole integer,score integer,updated_by uuid,updated_at timestamptz);
CREATE TABLE public.elleng_pair_hole_scores(tournament_id text,team_index integer,hole integer,pair_index integer,score integer,updated_by uuid,updated_at timestamptz);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text,team_index integer,hole integer,golfer_index integer,score integer,updated_by uuid,updated_at timestamptz);
INSERT INTO public.elleng_drafts VALUES('draft','00000000-0000-4000-8000-000000000001','{}'::jsonb);
INSERT INTO public.elleng_tournaments VALUES('fixture','draft','live',2);
INSERT INTO public.elleng_captains VALUES('draft','00000000-0000-4000-8000-000000000002',0);
INSERT INTO public.elleng_team_scores VALUES ('fixture',0,1,4,null,null);
INSERT INTO public.elleng_pair_hole_scores VALUES ('fixture',0,1,0,4,null,null);
INSERT INTO public.elleng_player_hole_scores VALUES ('fixture',0,10,0,4,null,null);
\i db/patches/20261029_commissioner_score_reset_rpc_REVIEW_ONLY.sql
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
\i db/patches/20261029_score_table_dml_lockdown_REVIEW_ONLY.sql
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $deny$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN PERFORM public.elleng_test_commissioner_clear_scores('fixture');
 EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Captain reset all tournament scores'; END IF;
END $deny$;
RESET ROLE;
DO $preserve$
BEGIN
 IF (SELECT count(*) FROM public.elleng_team_scores WHERE tournament_id='fixture')<>1
 OR (SELECT count(*) FROM public.elleng_pair_hole_scores WHERE tournament_id='fixture')<>1
 OR (SELECT count(*) FROM public.elleng_player_hole_scores WHERE tournament_id='fixture')<>1
 THEN RAISE EXCEPTION 'Unauthorized reset modified scores'; END IF;
END $preserve$;
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000001',false);
SET ROLE authenticated;
SELECT public.elleng_test_commissioner_clear_scores('fixture');
RESET ROLE;
DO $cleared$
BEGIN
 IF (SELECT count(*) FROM public.elleng_team_scores WHERE tournament_id='fixture')<>0
 OR (SELECT count(*) FROM public.elleng_pair_hole_scores WHERE tournament_id='fixture')<>0
 OR (SELECT count(*) FROM public.elleng_player_hole_scores WHERE tournament_id='fixture')<>0
 THEN RAISE EXCEPTION 'Authorized reset left score rows'; END IF;
 RAISE NOTICE 'PASS: commissioner reset clears all scoring tables after unauthorized caller denied';
END $cleared$;
ROLLBACK;
