\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text,team_count integer,status text);
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,state jsonb,tournament_date date);
CREATE TABLE public.elleng_player_accounts(draft_id text,user_id uuid,golfer_index integer,PRIMARY KEY(draft_id,user_id));
CREATE TABLE public.elleng_player_hole_scores(tournament_id text,team_index integer,hole integer,golfer_index integer,score integer CHECK(score BETWEEN 1 AND 20),updated_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tournament_id,hole,team_index,golfer_index));
INSERT INTO public.elleng_tournaments VALUES('elleng-cup-live','elleng-cup',2,'live');
INSERT INTO public.elleng_drafts VALUES('elleng-cup','{"playFormat":"shamble_points","tournamentDate":"2026-11-20","golfers":[{"name":"Synthetic A","team":0},{"name":"Synthetic B","team":1}],"teams":[{"roster":[0]},{"roster":[1]}]}','2026-11-20');
INSERT INTO public.elleng_player_accounts VALUES('elleng-cup','00000000-0000-0000-0000-000000000001',0),('elleng-cup','00000000-0000-0000-0000-000000000002',1);
\ir ../../db/releases/tournament-reliability/offline-score.sql
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $test$
DECLARE v jsonb;v_at timestamptz;v_new timestamptz;
BEGIN
 IF has_function_privilege('anon','public.elleng_save_own_offline_score(text,text,integer,integer,uuid,integer,integer,text,integer,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous replay must be denied'; END IF;
 v:=public.elleng_save_own_offline_score('elleng-cup','elleng-cup-live',1,4,'00000000-0000-0000-0000-000000000001',0,0,'2026-11-20',NULL,NULL);
 IF v->>'ok'<>'true' OR (SELECT score FROM public.elleng_player_hole_scores)<>4 THEN RAISE EXCEPTION 'Initial offline insert failed'; END IF;
 SELECT updated_at INTO v_at FROM public.elleng_player_hole_scores;
 v:=public.elleng_save_own_offline_score('elleng-cup','elleng-cup-live',1,4,'00000000-0000-0000-0000-000000000001',0,0,'2026-11-20',NULL,NULL);
 IF v->>'already_saved'<>'true' OR (SELECT updated_at FROM public.elleng_player_hole_scores) IS DISTINCT FROM v_at THEN RAISE EXCEPTION 'Acknowledgment retry changed a saved score'; END IF;
 BEGIN
  PERFORM public.elleng_save_own_offline_score('elleng-cup','elleng-cup-live',1,5,'00000000-0000-0000-0000-000000000001',0,0,'2026-11-20',NULL,NULL);
  RAISE EXCEPTION 'Stale offline overwrite was allowed';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
 v:=public.elleng_save_own_offline_score('elleng-cup','elleng-cup-live',1,5,'00000000-0000-0000-0000-000000000001',0,0,'2026-11-20',4,v_at);
 IF (SELECT score FROM public.elleng_player_hole_scores)<>5 THEN RAISE EXCEPTION 'Conditional correction failed'; END IF;
 SELECT updated_at INTO v_new FROM public.elleng_player_hole_scores;
 BEGIN
  PERFORM public.elleng_save_own_offline_score('elleng-cup','elleng-cup-live',1,6,'00000000-0000-0000-0000-000000000002',1,1,'2026-11-20',NULL,NULL);
  RAISE EXCEPTION 'Account switch was allowed';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 BEGIN
  PERFORM public.elleng_save_own_offline_score('elleng-cup','elleng-cup-live',1,6,'00000000-0000-0000-0000-000000000001',0,0,'2027-02-20',5,v_new);
  RAISE EXCEPTION 'Different event replay was allowed';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
 BEGIN
  PERFORM public.elleng_save_own_offline_score('elleng-cup','elleng-cup-live',1,6,'00000000-0000-0000-0000-000000000001',1,1,'2026-11-20',NULL,NULL);
  RAISE EXCEPTION 'Reassigned golfer replay was allowed';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
 v:=public.elleng_save_own_offline_score('elleng-cup','elleng-cup-live',1,NULL,'00000000-0000-0000-0000-000000000001',0,0,'2026-11-20',5,v_new);
 IF EXISTS(SELECT 1 FROM public.elleng_player_hole_scores) THEN RAISE EXCEPTION 'Conditional clear failed'; END IF;
 RAISE NOTICE 'PASS offline CAS: ownership, event isolation, duplicate acknowledgment, stale write rejection, correction and clear';
END $test$;
