-- Pick RPC matches weighted optimizer for version 2; version 1 preserved.
CREATE OR REPLACE FUNCTION public.elleng_weighted_pick(p_draft_id text, p_golfer_index integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid:=auth.uid();owner_uid uuid;s jsonb;opt jsonb;turn integer;cnt integer;total integer;g jsonb;chosen integer;captain_team integer;automatic boolean:=p_golfer_index IS NULL;fair_v2 boolean;weaker integer;band0 integer;band1 integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required';END IF;
 SELECT owner_id,state INTO owner_uid,s FROM public.elleng_drafts WHERE id=p_draft_id FOR UPDATE;
 IF s IS NULL THEN RAISE EXCEPTION 'Draft not found';END IF;
 SELECT team_index INTO captain_team FROM public.elleng_captains WHERE draft_id=p_draft_id AND user_id=uid;
 IF uid IS DISTINCT FROM owner_uid AND (captain_team IS NULL OR captain_team NOT IN (0,1)) THEN RAISE EXCEPTION 'Not authorized for this draft';END IF;
 IF s->>'draftRules' IS DISTINCT FROM 'weighted' OR s->>'balanceVersion' IS NULL OR s->>'balanceVersion' NOT IN ('1','2') THEN RAISE EXCEPTION 'Weighted draft is not prepared';END IF;
 IF coalesce((s->>'timerPaused')::boolean,true) THEN IF automatic THEN RETURN s;ELSE RAISE EXCEPTION 'Draft is paused';END IF;END IF;
 IF automatic AND (coalesce(s->>'timerEndsAt','')='' OR now()<(s->>'timerEndsAt')::timestamptz) THEN RETURN s;END IF;
 opt:=public.elleng_weighted_options(s);cnt:=jsonb_array_length(s->'picks');total:=(opt->'capacities'->>0)::integer+(opt->'capacities'->>1)::integer;
 IF cnt>=total THEN IF automatic THEN RETURN s;ELSE RAISE EXCEPTION 'Draft is complete';END IF;END IF;
 fair_v2:=s->>'balanceVersion'='2';
 IF fair_v2 THEN
  band0:=CASE s->'golfers'->((s->'teams'->0->>'captainGolferIndex')::integer)->>'band' WHEN 'A' THEN 5 WHEN 'B' THEN 3 WHEN 'C' THEN 2 WHEN 'D' THEN 1 ELSE NULL END;
  band1:=CASE s->'golfers'->((s->'teams'->1->>'captainGolferIndex')::integer)->>'band' WHEN 'A' THEN 5 WHEN 'B' THEN 3 WHEN 'C' THEN 2 WHEN 'D' THEN 1 ELSE NULL END;
  IF band0 IS NULL OR band1 IS NULL OR band0=band1 THEN RAISE EXCEPTION 'Captain fairness cannot determine draft order';END IF;
  weaker:=CASE WHEN band0<band1 THEN 0 ELSE 1 END;
  turn:=public.elleng_fair_turn(cnt,total,weaker);
 ELSE
  turn:=cnt%2;IF s->>'draftType'='snake' AND (cnt/2)%2=1 THEN turn:=1-turn;END IF;
 END IF;
 IF NOT automatic AND uid IS DISTINCT FROM owner_uid AND captain_team IS DISTINCT FROM turn THEN RAISE EXCEPTION 'It is not your team''s turn';END IF;
 IF automatic THEN
  SELECT (ordinality-1)::integer INTO chosen FROM jsonb_array_elements(s->'golfers') WITH ORDINALITY
  WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true) AND coalesce(value->'team','null')='null'::jsonb AND (opt->'eligible'->turn)?(value->>'band') ORDER BY random() LIMIT 1;
 ELSE chosen:=p_golfer_index;END IF;
 IF chosen IS NULL OR chosen<0 OR chosen>=jsonb_array_length(s->'golfers') THEN RAISE EXCEPTION 'No eligible golfer';END IF;
 g:=s->'golfers'->chosen;
 IF btrim(coalesce(g->>'name',''))='' OR NOT coalesce((g->>'participating')::boolean,true) OR coalesce(g->'team','null')<>'null'::jsonb OR NOT ((opt->'eligible'->turn)?(g->>'band')) THEN RAISE EXCEPTION 'Selection would reduce attainable team balance';END IF;
 s:=jsonb_set(s,ARRAY['golfers',chosen::text,'team'],to_jsonb(turn));
 s:=jsonb_set(s,ARRAY['teams',turn::text,'roster'],(s->'teams'->turn->'roster')||to_jsonb(chosen));
 s:=jsonb_set(s,'{picks}',(s->'picks')||jsonb_build_object('golfer',chosen,'team',turn,'auto',automatic));
 s:=s||jsonb_build_object('timerPaused',false,'timerEndsAt',now()+make_interval(secs=>coalesce((s->>'timerLength')::integer,60)));
 UPDATE public.elleng_drafts SET state=s,updated_at=clock_timestamp() WHERE id=p_draft_id;RETURN s;
END;$function$
;
