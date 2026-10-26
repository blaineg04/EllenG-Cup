-- Staged migration. Apply after isolated database rehearsal.
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
  v_min_penalty integer;
  v_candidate_penalty integer;
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

  v_total_picks := coalesce(nullif(v_state->>'golferCount','')::integer, jsonb_array_length(coalesce(v_state->'golfers','[]'::jsonb)));
  v_total_picks := greatest(1, least(v_total_picks, jsonb_array_length(coalesce(v_state->'golfers','[]'::jsonb))));
  v_pick_count := jsonb_array_length(coalesce(v_state->'picks','[]'::jsonb));
  if v_pick_count >= v_total_picks then return v_state; end if;

  v_round := v_pick_count / v_team_count;
  v_pos := v_pick_count % v_team_count;
  if coalesce(v_state->>'draftType','snake')='snake' and (v_round % 2)=1 then v_turn := (v_team_count - 1) - v_pos; else v_turn := v_pos; end if;

  v_open := coalesce(v_state->>'draftRules','banded')='open';

  -- Same minimum-penalty rule as elleng_make_pick.
  v_min_penalty := null;
  for v_i in 0..v_total_picks-1 loop
    v_g := (v_state->'golfers')->v_i;
    if coalesce(v_g->>'name','')<>'' and ((not (v_g ? 'team')) or v_g->'team'='null'::jsonb) then
      if v_open then
        v_candidates := array_append(v_candidates,v_i);
      else
        v_band := coalesce(v_g->>'band','');
        if v_band in ('A','B','C','D') then
          v_candidate_penalty := public.elleng_pick_balance_penalty(v_state,v_turn,v_band);
          if v_min_penalty is null or v_candidate_penalty < v_min_penalty then
            v_min_penalty := v_candidate_penalty;
            v_candidates := '{}';
          end if;
          if v_candidate_penalty = v_min_penalty then
            v_candidates := array_append(v_candidates,v_i);
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
