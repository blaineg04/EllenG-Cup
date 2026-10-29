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
CREATE TABLE public.elleng_team_scores(tournament_id text,team_index integer,hole integer,score integer,updated_by uuid,updated_at timestamptz,UNIQUE(tournament_id,team_index,hole));
CREATE TABLE public.elleng_pair_hole_scores(tournament_id text,team_index integer,hole integer,pair_index integer,score integer,updated_by uuid,updated_at timestamptz,UNIQUE(tournament_id,hole,team_index,pair_index));
CREATE TABLE public.elleng_player_hole_scores(tournament_id text,team_index integer,hole integer,golfer_index integer,score integer,updated_by uuid,updated_at timestamptz,UNIQUE(tournament_id,hole,team_index,golfer_index));
INSERT INTO public.elleng_drafts VALUES('draft','00000000-0000-4000-8000-000000000001','{"playFormat":"split_pair","teams":[{"roster":[0,1,2,3]},{"roster":[4,5,6,7]}],"golfers":[{"name":"A"},{"name":"B"},{"name":"C"},{"name":"D"},{"name":"E"},{"name":"F"},{"name":"G"},{"name":"H"}]}'::jsonb);
INSERT INTO public.elleng_tournaments VALUES('fixture','draft','live',2);
INSERT INTO public.elleng_captains VALUES('draft','00000000-0000-4000-8000-000000000002',0);
\i db/patches/20261028_split_pair_atomic_rpc_REVIEW_ONLY.sql
GRANT USAGE ON SCHEMA public,auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
\i db/patches/20261029_score_table_dml_lockdown_REVIEW_ONLY.sql
SELECT set_config('elleng.test_uid','00000000-0000-4000-8000-000000000002',false);
SET ROLE authenticated;
DO $direct$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN INSERT INTO public.elleng_pair_hole_scores(tournament_id,hole,team_index,pair_index,score)
 VALUES ('fixture',1,0,0,4); EXCEPTION WHEN insufficient_privilege THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Direct authenticated pair score write accepted'; END IF;
END $direct$;
SELECT public.elleng_test_authorized_split_pair('fixture',0,1,0,4);
SELECT public.elleng_test_authorized_split_pair('fixture',0,1,1,5);
DO $deny$
DECLARE blocked boolean:=false;
BEGIN
 BEGIN PERFORM public.elleng_test_authorized_split_pair('fixture',1,1,0,4);
 EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Captain scored unauthorized team'; END IF;
END $deny$;
RESET ROLE;
DO $result$
BEGIN
 IF (SELECT score FROM public.elleng_team_scores WHERE tournament_id='fixture' AND team_index=0 AND hole=1) IS DISTINCT FROM 9
 THEN RAISE EXCEPTION 'Authorized Split-Pair aggregate not saved'; END IF;
 RAISE NOTICE 'PASS: Split-Pair RPC saves under restricted role and rejects unauthorized team';
END $result$;
ROLLBACK;
