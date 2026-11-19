\set ON_ERROR_STOP on
-- Disposable PostgreSQL only. Never run against the production Supabase project.
DO $role$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
DO $role$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $role$;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,owner_id uuid,state jsonb NOT NULL,updated_at timestamptz NOT NULL);
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY,draft_id text,status text);
CREATE TABLE public.elleng_team_scores(tournament_id text);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text);
CREATE TABLE public.elleng_pair_hole_scores(tournament_id text);
CREATE TABLE public.elleng_group_assignments(draft_id text);
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.elleng_tournaments VALUES('elleng-cup-live','elleng-cup','setup');
INSERT INTO public.elleng_drafts
SELECT 'elleng-cup','11111111-1111-4111-8111-111111111111'::uuid,
 jsonb_build_object('draftRules','weighted','playFormat','shamble_points',
 'golfers',(SELECT jsonb_agg(jsonb_build_object('name',
  CASE i WHEN 56 THEN 'Connor Castille' WHEN 15 THEN 'Michael Glover'
   WHEN 7 THEN 'Donny Wyble' WHEN 20 THEN 'Patrick Carlton'
   WHEN 6 THEN 'Captain Carl' WHEN 38 THEN 'Captain Jarad'
   ELSE 'Golfer '||i END,
  'team',CASE WHEN i=56 THEN NULL WHEN i IN (6,12,5,26,15,13,17,18,2,25,19,11) THEN 0
    WHEN i IN (38,9,10,14,1,0,20,21,4,7,8,27) THEN 1 ELSE NULL END,
  'participating',i<>56,'late_added',i=27) ORDER BY i) FROM generate_series(0,56) i),
 'teams',jsonb_build_array(
   jsonb_build_object('captain','Captain Carl','roster',to_jsonb(ARRAY[6,12,5,26,15,13,17,18,2,25,19,11])),
   jsonb_build_object('captain','Captain Jarad','roster',to_jsonb(ARRAY[38,9,10,14,1,0,20,21,4,7,8,27]))),
 'picks',(SELECT jsonb_agg(jsonb_build_object('golfer',i,'team',CASE WHEN i=15 THEN 0 ELSE 1 END))
  FROM (SELECT unnest(ARRAY[6,12,5,26,15,13,17,18,2,25,19,11,38,9,10,14,1,0,20,21,4,7,8,27]) i) a)),
 now();
\i db/releases/withdraw-golfer/staged.sql
\i db/releases/commissioner-roster-adjustment/staged-rpc.sql
\i db/releases/commissioner-roster-adjustment/guard-staged.sql
CREATE TRIGGER guard_draft BEFORE UPDATE ON public.elleng_drafts FOR EACH ROW EXECUTE FUNCTION public.elleng_guard_weighted_roster();
GRANT USAGE ON SCHEMA auth,public TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT UPDATE ON public.elleng_drafts TO authenticated;
DO $test$
DECLARE st timestamptz; s jsonb; n integer; entry jsonb;
BEGIN
 EXECUTE 'SET LOCAL ROLE authenticated';
 FOREACH n IN ARRAY ARRAY[56,15,7,20] LOOP
  SELECT updated_at INTO st FROM public.elleng_drafts WHERE id='elleng-cup';
  entry:=CASE n WHEN 56 THEN jsonb_build_object('name','Connor Castille','team',0,'activate',true)
    WHEN 15 THEN jsonb_build_object('name','Michael Glover','team',1,'activate',false)
    WHEN 7 THEN jsonb_build_object('name','Donny Wyble','team',0,'activate',false)
    ELSE jsonb_build_object('name','Patrick Carlton','team',0,'activate',false) END;
  PERFORM public.elleng_commissioner_move_golfer(st,n,entry->>'name',(entry->>'team')::integer,(entry->>'activate')::boolean);
 END LOOP;
 SELECT state INTO s FROM public.elleng_drafts WHERE id='elleng-cup';
 IF s#>>'{golfers,56,participating}'<>'true' THEN RAISE EXCEPTION 'Connor not activated'; END IF;
 FOREACH n IN ARRAY ARRAY[56,7,20] LOOP
  IF s#>>ARRAY['golfers',n::text,'team']<>'0' THEN RAISE EXCEPTION 'Expected Carl: %',n; END IF;
 END LOOP;
 IF s#>>'{golfers,15,team}'<>'1' THEN RAISE EXCEPTION 'Michael not on Jarad'; END IF;
 FOREACH n IN ARRAY ARRAY[56,15,7,20] LOOP
  IF (SELECT count(*) FROM jsonb_array_elements(s->'teams') t,
      jsonb_array_elements_text(t->'roster') ri WHERE ri=n::text)<>1
  THEN RAISE EXCEPTION 'Invalid roster count for %',n; END IF;
 END LOOP;
 EXECUTE 'RESET ROLE';
END $test$;
-- Negative cases: invalid identity, stale version, unauthorized user, scoring.
DO $negative$
DECLARE stamp timestamptz; before_state jsonb; rejected boolean;
BEGIN
 SELECT updated_at,state INTO stamp,before_state FROM public.elleng_drafts WHERE id='elleng-cup';
 BEGIN
  PERFORM public.elleng_commissioner_move_golfer(stamp,15,'Wrong Golfer',0,false);
  RAISE EXCEPTION 'Identity mismatch unexpectedly succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Identity mismatch unexpectedly succeeded' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.elleng_commissioner_move_golfer(stamp - interval '1 second',15,'Michael Glover',0,false);
  RAISE EXCEPTION 'Stale version unexpectedly succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Stale version unexpectedly succeeded' THEN RAISE; END IF;
 END;
 PERFORM set_config('test.uid','22222222-2222-4222-8222-222222222222',true);
 BEGIN
  PERFORM public.elleng_commissioner_move_golfer(stamp,15,'Michael Glover',0,false);
  RAISE EXCEPTION 'Unauthorized user unexpectedly succeeded';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Unauthorized user unexpectedly succeeded' THEN RAISE; END IF;
 END;
 PERFORM set_config('test.uid','11111111-1111-4111-8111-111111111111',true);
 IF (SELECT state FROM public.elleng_drafts WHERE id='elleng-cup') IS DISTINCT FROM before_state
 THEN RAISE EXCEPTION 'Rejected request modified roster'; END IF;
 INSERT INTO public.elleng_player_hole_scores VALUES('elleng-cup-live');
 BEGIN
  PERFORM public.elleng_commissioner_move_golfer(stamp,15,'Michael Glover',0,false);
  RAISE EXCEPTION 'Score lock unexpectedly bypassed';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='Score lock unexpectedly bypassed' THEN RAISE; END IF;
 END;
 IF (SELECT state FROM public.elleng_drafts WHERE id='elleng-cup') IS DISTINCT FROM before_state
 THEN RAISE EXCEPTION 'Score-blocked request modified roster'; END IF;
END $negative$;
SELECT 'Commissioner roster move fixture passed' AS result;
