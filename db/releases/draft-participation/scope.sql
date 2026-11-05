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

  select count(*)::integer into v_total_picks from jsonb_array_elements(coalesce(v_state->'golfers','[]'::jsonb)) g where btrim(coalesce(g->>'name',''))<>'' and coalesce((g->>'participating')::boolean,true);
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
  if not coalesce((v_golfer->>'participating')::boolean,true) then raise exception 'Golfer is not playing in this tournament'; end if;
  if (v_golfer ? 'team') and v_golfer->'team' <> 'null'::jsonb then raise exception 'Golfer has already been drafted'; end if;

  if not v_open then
    v_band := coalesce(v_golfer->>'band','');
    if v_band not in ('A','B','C','D') then raise exception 'Golfer rank is invalid'; end if;

    v_penalty := public.elleng_pick_balance_penalty(v_state,v_team,v_band);
    v_min_penalty := null;
    for v_i in 0..jsonb_array_length(coalesce(v_state->'golfers','[]'::jsonb))-1 loop
      v_candidate := (v_state->'golfers')->v_i;
      if coalesce(v_candidate->>'name','')<>'' and coalesce((v_candidate->>'participating')::boolean,true)
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

CREATE OR REPLACE FUNCTION public.elleng_auto_pick(p_draft_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_state jsonb;
  v_pick_count integer;
  v_team_count integer;
  v_total_picks integer;
  v_round integer;
  v_pos integer;
  v_turn integer;
  v_timer integer;
  v_deadline timestamptz;
  v_i integer;
  v_j integer;
  v_g jsonb;
  v_band text;
  v_roster jsonb;
  v_team_band_count integer;
  v_lowest integer;
  v_other_count integer;
  v_team_ab integer;
  v_lowest_ab integer;
  v_candidates integer[] := '{}';
  v_choice integer;
  v_open boolean;
begin
  if v_uid is null then raise exception 'Sign in required'; end if;

  select owner_id, state into v_owner, v_state
  from public.elleng_drafts
  where id=p_draft_id
  for update;
  if v_state is null then raise exception 'Draft not found'; end if;

  if v_uid <> v_owner and not exists (
    select 1 from public.elleng_captains c where c.draft_id=p_draft_id and c.user_id=v_uid
  ) then raise exception 'Not authorized for this draft'; end if;

  if coalesce((v_state->>'timerPaused')::boolean,true) then return v_state; end if;
  if coalesce(v_state->>'timerEndsAt','')='' then return v_state; end if;

  v_deadline := (v_state->>'timerEndsAt')::timestamptz;
  if now() < v_deadline then return v_state; end if;

  v_team_count := jsonb_array_length(coalesce(v_state->'teams','[]'::jsonb));
  if v_team_count < 1 then raise exception 'Draft has no teams'; end if;

  select count(*)::integer into v_total_picks from jsonb_array_elements(coalesce(v_state->'golfers','[]'::jsonb)) g where btrim(coalesce(g->>'name',''))<>'' and coalesce((g->>'participating')::boolean,true);
  v_pick_count := jsonb_array_length(coalesce(v_state->'picks','[]'::jsonb));
  if v_pick_count >= v_total_picks then return v_state; end if;

  v_round := v_pick_count / v_team_count;
  v_pos := v_pick_count % v_team_count;
  if coalesce(v_state->>'draftType','snake')='snake' and (v_round % 2)=1 then v_turn := (v_team_count - 1) - v_pos; else v_turn := v_pos; end if;

  v_open := coalesce(v_state->>'draftRules','banded')='open';

  for v_i in 0..jsonb_array_length(coalesce(v_state->'golfers','[]'::jsonb))-1 loop
    v_g := (v_state->'golfers')->v_i;
    if coalesce(v_g->>'name','')<>'' and coalesce((v_g->>'participating')::boolean,true) and ((not (v_g ? 'team')) or v_g->'team'='null'::jsonb) then
      if v_open then
        v_candidates := array_append(v_candidates, v_i);
      else
        v_band := coalesce(v_g->>'band','');
        if v_band in ('A','B','C','D') then
          v_roster := coalesce((v_state->'teams'->v_turn)->'roster','[]'::jsonb);
          select count(*) into v_team_band_count
          from jsonb_array_elements(v_roster) r
          join lateral (select (r #>> '{}')::int as idx) x on true
          where coalesce((v_state->'golfers'->x.idx)->>'band','')=v_band;

          v_lowest := null;
          for v_j in 0..v_team_count-1 loop
            v_roster := coalesce((v_state->'teams'->v_j)->'roster','[]'::jsonb);
            select count(*) into v_other_count
            from jsonb_array_elements(v_roster) r
            join lateral (select (r #>> '{}')::int as idx) x on true
            where coalesce((v_state->'golfers'->x.idx)->>'band','')=v_band;
            if v_lowest is null or v_other_count < v_lowest then v_lowest := v_other_count; end if;
          end loop;

          if v_team_band_count = v_lowest then
            if v_band in ('A','B') then
              v_team_ab := public.elleng_team_ab_count(v_state,v_turn);
              v_lowest_ab := null;
              for v_j in 0..v_team_count-1 loop
                v_other_count := public.elleng_team_ab_count(v_state,v_j);
                if v_lowest_ab is null or v_other_count < v_lowest_ab then v_lowest_ab := v_other_count; end if;
              end loop;
              if v_team_ab = v_lowest_ab then v_candidates := array_append(v_candidates, v_i); end if;
            else
              v_candidates := array_append(v_candidates, v_i);
            end if;
          end if;
        end if;
      end if;
    end if;
  end loop;

  if array_length(v_candidates,1) is null then raise exception 'No eligible golfers available for automatic pick'; end if;

  v_choice := v_candidates[1 + floor(random() * array_length(v_candidates,1))::int];
  v_state := jsonb_set(v_state, array['golfers',v_choice::text,'team'], to_jsonb(v_turn), true);
  v_roster := coalesce((v_state->'teams'->v_turn)->'roster','[]'::jsonb) || to_jsonb(v_choice);
  v_state := jsonb_set(v_state, array['teams',v_turn::text,'roster'], v_roster, true);
  v_state := jsonb_set(v_state, '{picks}', coalesce(v_state->'picks','[]'::jsonb) || jsonb_build_object('golfer',v_choice,'team',v_turn,'auto',true), true);

  v_timer := coalesce((v_state->>'timerLength')::integer,60);
  v_state := jsonb_set(v_state,'{timerPaused}','false'::jsonb,true);
  v_state := jsonb_set(v_state,'{timerEndsAt}',to_jsonb((now() + make_interval(secs=>v_timer))::text),true);

  update public.elleng_drafts set state=v_state, updated_at=now() where id=p_draft_id;
  return v_state;
end;
$function$
;