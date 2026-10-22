-- Read-only snapshot of actual EllenG Cup draft RPCs, 2026-10-22.
-- Executed ONLY on disposable CI PostgreSQL with a fake auth.uid() shim.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('elleng.test_actor',true),'')::uuid $$;
CREATE TABLE public.elleng_drafts(id text primary key,owner_id uuid,state jsonb not null,updated_at timestamptz default now());
CREATE TABLE public.elleng_captains(draft_id text not null,user_id uuid not null,team_index int not null,primary key(draft_id,user_id));
CREATE OR REPLACE FUNCTION public.elleng_make_pick(p_draft_id text, p_golfer_index integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_team integer;
  v_state jsonb;
  v_pick_count integer;
  v_team_count integer;
  v_total_picks integer;
  v_round integer;
  v_pos integer;
  v_turn integer;
  v_golfer jsonb;
  v_band text;
  v_roster jsonb;
  v_i integer;
  v_timer integer;
  v_penalty integer;
  v_min_penalty integer;
  v_candidate jsonb;
  v_candidate_band text;
  v_candidate_penalty integer;
  v_open boolean;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select team_index into v_team
  from public.elleng_captains
  where draft_id=p_draft_id and user_id=v_uid;
  if v_team is null then raise exception 'Captain is not assigned to a team'; end if;

  select state into v_state
  from public.elleng_drafts
  where id=p_draft_id
  for update;
  if v_state is null then raise exception 'Draft not found'; end if;

  v_open := coalesce(v_state->>'draftRules','banded')='open';

  v_team_count := jsonb_array_length(coalesce(v_state->'teams','[]'::jsonb));
  if v_team_count < 1 then raise exception 'Draft has no teams'; end if;
  if v_team < 0 or v_team >= v_team_count then raise exception 'Captain team is no longer active'; end if;

  v_total_picks := coalesce(nullif(v_state->>'golferCount','')::integer, jsonb_array_length(coalesce(v_state->'golfers','[]'::jsonb)));
  v_total_picks := greatest(1, least(v_total_picks, jsonb_array_length(coalesce(v_state->'golfers','[]'::jsonb))));
  v_pick_count := jsonb_array_length(coalesce(v_state->'picks','[]'::jsonb));
  if v_pick_count >= v_total_picks then raise exception 'Draft is complete'; end if;

  if coalesce((v_state->>'timerPaused')::boolean,true) then raise exception 'Draft is paused'; end if;

  v_round := v_pick_count / v_team_count;
  v_pos := v_pick_count % v_team_count;
  if coalesce(v_state->>'draftType','snake')='snake' and (v_round % 2)=1 then
    v_turn := (v_team_count - 1) - v_pos;
  else
    v_turn := v_pos;
  end if;
  if v_turn <> v_team then raise exception 'It is not your team''s turn'; end if;

  if p_golfer_index < 0 or p_golfer_index >= jsonb_array_length(coalesce(v_state->'golfers','[]'::jsonb)) then raise exception 'Invalid golfer'; end if;

  v_golfer := (v_state->'golfers')->p_golfer_index;
  if coalesce(v_golfer->>'name','')='' then raise exception 'Golfer slot is empty'; end if;
  if (v_golfer ? 'team') and v_golfer->'team' <> 'null'::jsonb then raise exception 'Golfer has already been drafted'; end if;

  if not v_open then
    v_band := coalesce(v_golfer->>'band','');
    if v_band not in ('A','B','C','D') then raise exception 'Golfer rank is invalid'; end if;

    v_penalty := public.elleng_pick_balance_penalty(v_state,v_team,v_band);
    v_min_penalty := null;
    for v_i in 0..jsonb_array_length(coalesce(v_state->'golfers','[]'::jsonb))-1 loop
      v_candidate := (v_state->'golfers')->v_i;
      if coalesce(v_candidate->>'name','')<>''
         and (not (v_candidate ? 'team') or v_candidate->'team'='null'::jsonb) then
        v_candidate_band := coalesce(v_candidate->>'band','');
        if v_candidate_band in ('A','B','C','D') then
          v_candidate_penalty := public.elleng_pick_balance_penalty(v_state,v_team,v_candidate_band);
          if v_min_penalty is null or v_candidate_penalty < v_min_penalty then
            v_min_penalty := v_candidate_penalty;
          end if;
        end if;
      end if;
    end loop;

    if v_min_penalty is null then raise exception 'No eligible golfers remain'; end if;
    if v_penalty <> v_min_penalty then raise exception 'Band balance limit reached'; end if;
  end if;

  v_state := jsonb_set(v_state, array['golfers',p_golfer_index::text,'team'], to_jsonb(v_team), true);
  v_roster := coalesce((v_state->'teams'->v_team)->'roster','[]'::jsonb) || to_jsonb(p_golfer_index);
  v_state := jsonb_set(v_state, array['teams',v_team::text,'roster'], v_roster, true);
  v_state := jsonb_set(v_state, '{picks}', coalesce(v_state->'picks','[]'::jsonb) || jsonb_build_object('golfer',p_golfer_index,'team',v_team), true);

  v_timer := coalesce((v_state->>'timerLength')::integer,60);
  v_state := jsonb_set(v_state,'{timerPaused}','false'::jsonb,true);
  v_state := jsonb_set(v_state,'{timerEndsAt}',to_jsonb((now() + make_interval(secs=>v_timer))::text),true);

  update public.elleng_drafts set state=v_state, updated_at=now() where id=p_draft_id;
  return v_state;
end;
$function$;

CREATE OR REPLACE FUNCTION public.elleng_pick_balance_penalty(p_state jsonb, p_team integer, p_band text)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare
  v_team_count integer;
  v_i integer;
  v_my integer;
  v_lowest integer;
  v_other integer;
  v_my_ab integer;
  v_lowest_ab integer;
begin
  if p_band not in ('A','B','C','D') then return 1000000; end if;
  v_team_count := jsonb_array_length(coalesce(p_state->'teams','[]'::jsonb));
  if v_team_count < 1 or p_team < 0 or p_team >= v_team_count then return 1000000; end if;

  select count(*) into v_my
  from jsonb_array_elements(coalesce((p_state->'teams'->p_team)->'roster','[]'::jsonb)) r
  join lateral (select (r #>> '{}')::int as idx) x on true
  where coalesce((p_state->'golfers'->x.idx)->>'band','')=p_band;

  v_lowest := null;
  for v_i in 0..v_team_count-1 loop
    select count(*) into v_other
    from jsonb_array_elements(coalesce((p_state->'teams'->v_i)->'roster','[]'::jsonb)) r
    join lateral (select (r #>> '{}')::int as idx) x on true
    where coalesce((p_state->'golfers'->x.idx)->>'band','')=p_band;
    if v_lowest is null or v_other < v_lowest then v_lowest := v_other; end if;
  end loop;

  if p_band in ('A','B') then
    v_my_ab := public.elleng_team_ab_count(p_state,p_team);
    v_lowest_ab := null;
    for v_i in 0..v_team_count-1 loop
      v_other := public.elleng_team_ab_count(p_state,v_i);
      if v_lowest_ab is null or v_other < v_lowest_ab then v_lowest_ab := v_other; end if;
    end loop;
    return (v_my-v_lowest) + (v_my_ab-v_lowest_ab);
  end if;

  return v_my-v_lowest;
end;
$function$;

CREATE OR REPLACE FUNCTION public.elleng_team_ab_count(p_state jsonb, p_team integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select count(*)::integer
  from jsonb_array_elements(coalesce((p_state->'teams'->p_team)->'roster','[]'::jsonb)) r
  join lateral (select (r #>> '{}')::int as idx) x on true
  where coalesce((p_state->'golfers'->x.idx)->>'band','') in ('A','B');
$function$;

INSERT INTO public.elleng_drafts(id,owner_id,state) VALUES ('captain-qa','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
'{"draftType":"snake","draftRules":"open","timerPaused":false,"timerLength":60,"golferCount":4,"picks":[],"golfers":[{"name":"A"},{"name":"B"},{"name":"C"},{"name":"D"}],"teams":[{"roster":[]},{"roster":[]}]}'::jsonb);
INSERT INTO public.elleng_captains VALUES ('captain-qa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',0),('captain-qa','cccccccc-cccc-cccc-cccc-cccccccccccc',1);
DO $qa$
DECLARE v_state jsonb;
BEGIN
 PERFORM set_config('elleng.test_actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
 v_state:=public.elleng_make_pick('captain-qa',0);
 IF jsonb_array_length(v_state->'picks')<>1 OR (v_state->'golfers'->0->>'team')<>'0' THEN RAISE EXCEPTION 'Captain 0 pick failed'; END IF;
 BEGIN
   PERFORM public.elleng_make_pick('captain-qa',2);
   RAISE EXCEPTION 'Wrong turn accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'It is not your team''s turn' THEN RAISE; END IF; END;
 PERFORM set_config('elleng.test_actor','cccccccc-cccc-cccc-cccc-cccccccccccc',true);
 v_state:=public.elleng_make_pick('captain-qa',1);
 IF jsonb_array_length(v_state->'picks')<>2 THEN RAISE EXCEPTION 'Captain 1 pick failed'; END IF;
 BEGIN
   PERFORM public.elleng_make_pick('captain-qa',1);
   RAISE EXCEPTION 'Duplicate golfer accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Golfer has already been drafted' THEN RAISE; END IF; END;
 PERFORM set_config('elleng.test_actor','dddddddd-dddd-dddd-dddd-dddddddddddd',true);
 BEGIN
   PERFORM public.elleng_make_pick('captain-qa',2);
   RAISE EXCEPTION 'Unassigned captain accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Captain is not assigned to a team' THEN RAISE; END IF; END;
 RAISE NOTICE 'PASS: real captain RPC enforces turns, duplicate rejection, and captain assignment';
END $qa$;
