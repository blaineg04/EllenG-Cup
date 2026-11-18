\set ON_ERROR_STOP on
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE public.elleng_drafts(id text PRIMARY KEY, owner_id uuid, state jsonb NOT NULL, updated_at timestamptz NOT NULL);
CREATE TABLE public.elleng_tournaments(id text PRIMARY KEY, draft_id text, status text);
CREATE TABLE public.elleng_team_scores(tournament_id text);
CREATE TABLE public.elleng_player_hole_scores(tournament_id text, golfer_index integer, team_index integer, hole integer, score integer);
CREATE TABLE public.elleng_pair_hole_scores(tournament_id text);
CREATE TABLE public.elleng_group_assignments(draft_id text);
SELECT set_config('test.uid','11111111-1111-4111-8111-111111111111',false);
INSERT INTO public.elleng_tournaments VALUES('elleng-cup-live','elleng-cup','setup');
INSERT INTO public.elleng_drafts
SELECT 'elleng-cup','11111111-1111-4111-8111-111111111111'::uuid,
 jsonb_build_object('draftRules','weighted','playFormat','shamble_points',
 'golfers',(SELECT jsonb_agg(jsonb_build_object('name',CASE WHEN i=0 THEN 'Captain A' WHEN i=12 THEN 'Captain B' ELSE 'Golfer '||i END,'team',CASE WHEN i<12 THEN 0 ELSE 1 END,'participating',true) ORDER BY i) FROM generate_series(0,23) i),
 'teams',jsonb_build_array(jsonb_build_object('captain','Captain A','roster',(SELECT jsonb_agg(i ORDER BY i) FROM generate_series(0,11) i)),jsonb_build_object('captain','Captain B','roster',(SELECT jsonb_agg(i ORDER BY i) FROM generate_series(12,23) i))),
 'picks',(SELECT jsonb_agg(jsonb_build_object('golfer',i) ORDER BY i) FROM generate_series(0,22) i)),
 now();
\i db/releases/withdraw-golfer/guard-staged.sql
CREATE TRIGGER guard_draft BEFORE UPDATE ON public.elleng_drafts FOR EACH ROW EXECUTE FUNCTION public.elleng_guard_weighted_roster();
\i db/releases/withdraw-golfer/staged.sql
\i db/releases/withdraw-golfer/restore-staged.sql
\i db/releases/withdraw-golfer/score-guard-staged.sql
DO $$
DECLARE stamp timestamptz; result jsonb; state_before jsonb;
BEGIN
 SELECT updated_at,state INTO stamp,state_before FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_withdraw_golfer('elleng-cup','elleng-cup-live',stamp,13,'test');
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Withdrawal failed'; END IF;
 IF (SELECT state->'picks' FROM public.elleng_drafts WHERE id='elleng-cup') IS DISTINCT FROM state_before->'picks' THEN RAISE EXCEPTION 'Picks changed'; END IF;
 IF (SELECT state->'teams' FROM public.elleng_drafts WHERE id='elleng-cup') IS DISTINCT FROM state_before->'teams' THEN RAISE EXCEPTION 'Teams changed'; END IF;
 BEGIN
  INSERT INTO public.elleng_player_hole_scores VALUES('elleng-cup-live',13,1,1,4);
  RAISE EXCEPTION 'Withdrawn golfer score unexpectedly allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 SELECT updated_at INTO stamp FROM public.elleng_drafts WHERE id='elleng-cup';
 result:=public.elleng_restore_golfer('elleng-cup','elleng-cup-live',stamp,13);
 IF result->>'ok'<>'true' THEN RAISE EXCEPTION 'Restore failed'; END IF;
 IF (SELECT state->'golfers'->13->>'participating' FROM public.elleng_drafts WHERE id='elleng-cup')<>'true' THEN RAISE EXCEPTION 'Restore did not reactivate golfer'; END IF;
END $$;
