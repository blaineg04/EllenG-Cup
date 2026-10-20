-- Run ONLY on a fresh, disposable localhost PostgreSQL database.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT '00000000-0000-0000-0000-000000000011'::uuid$$;
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY,owner_id uuid,state jsonb,updated_at timestamptz DEFAULT now());
CREATE TABLE public.elleng_captains(draft_id text,user_id uuid,team_index integer);
CREATE OR REPLACE FUNCTION public.elleng_team_ab_count(s jsonb,t integer) RETURNS integer LANGUAGE sql IMMUTABLE AS $$
SELECT count(*)::integer FROM jsonb_array_elements(coalesce((s->'teams'->t)->'roster','[]'::jsonb)) r
WHERE (s->'golfers'->((r #>> '{}')::integer)->>'band') IN ('A','B')$$;
CREATE OR REPLACE FUNCTION public.elleng_pick_balance_penalty(s jsonb,t integer,b text) RETURNS integer LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE i integer; mine integer; least_band integer; n integer; least_ab integer; BEGIN
 SELECT count(*) INTO mine FROM jsonb_array_elements(coalesce((s->'teams'->t)->'roster','[]'::jsonb)) r
 WHERE (s->'golfers'->((r #>> '{}')::integer)->>'band')=b;
 least_band := mine;
 FOR i IN 0..jsonb_array_length(s->'teams')-1 LOOP
  SELECT count(*) INTO n FROM jsonb_array_elements(coalesce((s->'teams'->i)->'roster','[]'::jsonb)) r
  WHERE (s->'golfers'->((r #>> '{}')::integer)->>'band')=b;
  least_band:=least(least_band,n);
 END LOOP;
 IF b IN ('A','B') THEN
  least_ab:=public.elleng_team_ab_count(s,t);
  FOR i IN 0..jsonb_array_length(s->'teams')-1 LOOP least_ab:=least(least_ab,public.elleng_team_ab_count(s,i)); END LOOP;
  RETURN mine-least_band+public.elleng_team_ab_count(s,t)-least_ab;
 END IF;
 RETURN mine-least_band;
END $$;
INSERT INTO public.elleng_drafts(id,owner_id,state) VALUES ('test-draft','00000000-0000-0000-0000-000000000011',
jsonb_build_object(
 'teams',jsonb_build_array(jsonb_build_object('roster',jsonb_build_array(0,2)),jsonb_build_object('roster',jsonb_build_array(3))),
 'golfers',jsonb_build_array(
 jsonb_build_object('name','P0','band','A','team',0),
 jsonb_build_object('name','P1','band','A','team',null),
 jsonb_build_object('name','P2','band','B','team',0),
 jsonb_build_object('name','P3','band','C','team',1)),
 'picks',jsonb_build_array(jsonb_build_object('golfer',0,'team',0),jsonb_build_object('golfer',2,'team',0),jsonb_build_object('golfer',3,'team',1)),
 'golferCount',4,'draftType','snake','draftRules','banded','timerPaused',false,'timerEndsAt',(now()-interval '2 minutes')::text,'timerLength',60));
