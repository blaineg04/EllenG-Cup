-- EllenG Cup draft auto-pick parity patch (REVIEW ONLY; not applied).
-- Apply only after isolated PostgreSQL regression + authenticated rehearsal.
-- Uses the same public.elleng_pick_balance_penalty as elleng_make_pick.
CREATE OR REPLACE FUNCTION public.elleng_auto_pick(p_draft_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
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
  v_g jsonb;
  v_band text;
  v_roster jsonb;
  v_open boolean;
  v_penalty integer;
  v_min_penalty integer := NULL;
  v_candidates integer[] := '{}';
  v_choice integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  SELECT owner_id, state INTO v_owner, v_state
  FROM public.elleng_drafts WHERE id = p_draft_id FOR UPDATE;
  IF v_state IS NULL THEN RAISE EXCEPTION 'Draft not found'; END IF;
  IF v_uid <> v_owner AND NOT EXISTS (
    SELECT 1 FROM public.elleng_captains c
    WHERE c.draft_id = p_draft_id AND c.user_id = v_uid
  ) THEN RAISE EXCEPTION 'Not authorized for this draft'; END IF;
  IF coalesce((v_state->>'timerPaused')::boolean, true) THEN RETURN v_state; END IF;
  IF coalesce(v_state->>'timerEndsAt', '') = '' THEN RETURN v_state; END IF;
  v_deadline := (v_state->>'timerEndsAt')::timestamptz;
  IF now() < v_deadline THEN RETURN v_state; END IF;

  v_team_count := jsonb_array_length(coalesce(v_state->'teams', '[]'::jsonb));
  IF v_team_count < 1 THEN RAISE EXCEPTION 'Draft has no teams'; END IF;
  v_total_picks := coalesce(nullif(v_state->>'golferCount', '')::integer,
    jsonb_array_length(coalesce(v_state->'golfers', '[]'::jsonb)));
  v_total_picks := greatest(1, least(v_total_picks,
    jsonb_array_length(coalesce(v_state->'golfers', '[]'::jsonb))));
  v_pick_count := jsonb_array_length(coalesce(v_state->'picks', '[]'::jsonb));
  IF v_pick_count >= v_total_picks THEN RETURN v_state; END IF;

  v_round := v_pick_count / v_team_count;
  v_pos := v_pick_count % v_team_count;
  IF coalesce(v_state->>'draftType', 'snake') = 'snake' AND (v_round % 2) = 1
    THEN v_turn := (v_team_count - 1) - v_pos;
    ELSE v_turn := v_pos;
  END IF;
  v_open := coalesce(v_state->>'draftRules', 'banded') = 'open';

  -- Evaluate every undrafted golfer, exactly as manual pick eligibility does.
  -- In banded mode, only minimum-penalty choices are eligible. When a lower
  -- penalty is found, discard candidates from the prior penalty tier.
  FOR v_i IN 0..jsonb_array_length(coalesce(v_state->'golfers', '[]'::jsonb)) - 1 LOOP
    v_g := (v_state->'golfers')->v_i;
    IF coalesce(v_g->>'name', '') <> ''
       AND (NOT (v_g ? 'team') OR v_g->'team' = 'null'::jsonb) THEN
      IF v_open THEN
        v_candidates := array_append(v_candidates, v_i);
      ELSE
        v_band := coalesce(v_g->>'band', '');
        IF v_band IN ('A','B','C','D') THEN
          v_penalty := public.elleng_pick_balance_penalty(v_state, v_turn, v_band);
          IF v_min_penalty IS NULL OR v_penalty < v_min_penalty THEN
            v_min_penalty := v_penalty;
            v_candidates := ARRAY[v_i];
          ELSIF v_penalty = v_min_penalty THEN
            v_candidates := array_append(v_candidates, v_i);
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;
  IF cardinality(v_candidates) = 0 THEN
    RAISE EXCEPTION 'No eligible golfers available for automatic pick';
  END IF;
  v_choice := v_candidates[1 + floor(random() * cardinality(v_candidates))::integer];
  v_state := jsonb_set(v_state, ARRAY['golfers',v_choice::text,'team'], to_jsonb(v_turn), true);
  v_roster := coalesce((v_state->'teams'->v_turn)->'roster', '[]'::jsonb) || to_jsonb(v_choice);
  v_state := jsonb_set(v_state, ARRAY['teams',v_turn::text,'roster'], v_roster, true);
  v_state := jsonb_set(v_state, '{picks}', coalesce(v_state->'picks','[]'::jsonb)
    || jsonb_build_object('golfer',v_choice,'team',v_turn,'auto',true), true);
  v_timer := coalesce((v_state->>'timerLength')::integer, 60);
  v_state := jsonb_set(v_state, '{timerPaused}', 'false'::jsonb, true);
  v_state := jsonb_set(v_state, '{timerEndsAt}',
    to_jsonb((now() + make_interval(secs => v_timer))::text), true);
  UPDATE public.elleng_drafts
  SET state = v_state, updated_at = now() WHERE id = p_draft_id;
  RETURN v_state;
END;
$function$;
