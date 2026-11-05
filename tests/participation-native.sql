\set ON_ERROR_STOP on
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
CREATE TABLE elleng_tournaments(id text PRIMARY KEY,draft_id text,status text);
CREATE TABLE elleng_drafts(id text PRIMARY KEY,owner_id uuid,state jsonb,updated_at timestamptz);
CREATE TABLE elleng_player_accounts(draft_id text,golfer_index integer,user_id uuid,display_name text,username text,photo_url text);
CREATE TABLE elleng_team_scores(tournament_id text);
CREATE TABLE elleng_player_hole_scores(tournament_id text);
CREATE TABLE elleng_pair_hole_scores(tournament_id text);
CREATE TABLE elleng_group_assignments(draft_id text,golfer_index integer);
INSERT INTO elleng_tournaments VALUES('elleng-cup-live','elleng-cup','setup');
INSERT INTO elleng_drafts VALUES('elleng-cup','00000000-0000-0000-0000-000000000001','{"golfers":[{"name":"Synthetic A","photo_url":"synthetic-photo","team":null},{"name":"Synthetic B","team":null}],"teams":[{"roster":[]}],"picks":[],"playFormat":"shamble_points"}',now());
INSERT INTO elleng_player_accounts VALUES('elleng-cup',4,'00000000-0000-0000-0000-000000000002','Synthetic Registered','synthetic','synthetic-photo');
\ir ../db/releases/player-participation/status.sql
SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
DO $$
DECLARE stamp timestamptz; s jsonb; before_accounts jsonb;
BEGIN
 IF has_function_privilege('anon','public.elleng_set_player_participation(text,text,integer,boolean,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'anon allowed'; END IF;
 SELECT jsonb_agg(to_jsonb(a)) INTO before_accounts FROM elleng_player_accounts a;
 SELECT updated_at INTO stamp FROM elleng_drafts;
 PERFORM elleng_set_player_participation('elleng-cup','elleng-cup-live',0,false,stamp);
 SELECT state INTO s FROM elleng_drafts;
 IF s#>>'{golfers,0,participating}'<>'false' OR s#>>'{golfers,0,photo_url}'<>'synthetic-photo' OR s#>>'{golfers,1,name}'<>'Synthetic B' THEN RAISE EXCEPTION 'preservation failed'; END IF;
 BEGIN
 PERFORM elleng_set_player_participation('elleng-cup','elleng-cup-live',0,true,stamp);RAISE EXCEPTION 'stale accepted';
 EXCEPTION WHEN SQLSTATE '40001' THEN NULL; END;
 SELECT updated_at INTO stamp FROM elleng_drafts;
 PERFORM elleng_set_player_participation('elleng-cup','elleng-cup-live',4,true,stamp);
 IF (SELECT state#>>'{golfers,4,name}' FROM elleng_drafts)<>'Synthetic Registered' OR (SELECT state#>>'{golfers,4,participating}' FROM elleng_drafts)<>'true' THEN RAISE EXCEPTION 'registered promotion failed'; END IF;
 IF before_accounts IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(a)) FROM elleng_player_accounts a) THEN RAISE EXCEPTION 'account changed'; END IF;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
 BEGIN
 PERFORM elleng_set_player_participation('elleng-cup','elleng-cup-live',0,true,(SELECT updated_at FROM elleng_drafts));RAISE EXCEPTION 'nonowner accepted';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
 INSERT INTO elleng_player_hole_scores VALUES('elleng-cup-live');
 BEGIN
 PERFORM elleng_set_player_participation('elleng-cup','elleng-cup-live',0,true,(SELECT updated_at FROM elleng_drafts));RAISE EXCEPTION 'scores accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
 DELETE FROM elleng_player_hole_scores;
 UPDATE elleng_drafts SET state=jsonb_set(state,'{picks}','[{"golfer":1}]');
 BEGIN
 PERFORM elleng_set_player_participation('elleng-cup','elleng-cup-live',0,true,(SELECT updated_at FROM elleng_drafts));RAISE EXCEPTION 'picks accepted' USING ERRCODE='XX000';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN NULL; END;
END $$;
