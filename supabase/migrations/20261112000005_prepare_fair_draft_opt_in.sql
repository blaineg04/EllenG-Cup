-- Separate commissioner-only opt-in; preserve existing version-1 preparation.
CREATE OR REPLACE FUNCTION public.elleng_prepare_fair_draft(p_draft_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE s jsonb; uid uuid:=auth.uid(); ids integer[]:='{}';matches integer[];t integer;g jsonb;p jsonb;i integer;name text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required';END IF;
 SELECT state INTO s FROM public.elleng_drafts WHERE id=p_draft_id AND owner_id=uid FOR UPDATE;
 IF s IS NULL THEN RAISE EXCEPTION 'Commissioner access required';END IF;
 IF jsonb_array_length(s->'teams')<>2 THEN RAISE EXCEPTION 'Weighted balance requires two teams';END IF;
 IF NOT coalesce((s->>'timerPaused')::boolean,true) THEN RAISE EXCEPTION 'Pause the draft before preparing weighted balance';END IF;
 FOR t IN 0..1 LOOP
  name:=lower(btrim(s->'teams'->t->>'captain'));
  SELECT array_agg((ordinality-1)::integer) INTO matches FROM jsonb_array_elements(s->'golfers') WITH ORDINALITY WHERE lower(btrim(value->>'name'))=name AND btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
  IF coalesce(cardinality(matches),0)<>1 OR matches[1]=ANY(ids) THEN RAISE EXCEPTION 'Each captain must match one distinct playing golfer';END IF;
  ids:=array_append(ids,matches[1]);
 END LOOP;
 i:=0;FOR p IN SELECT value FROM jsonb_array_elements(coalesce(s->'picks','[]')) LOOP
  IF i>1 OR (p->>'team')::integer IS DISTINCT FROM i OR (p->>'golfer')::integer IS DISTINCT FROM ids[i+1] THEN RAISE EXCEPTION 'Cannot change balancing after ordinary picks';END IF;i:=i+1;
 END LOOP;
 i:=0;FOR g IN SELECT value FROM jsonb_array_elements(s->'golfers') LOOP
  IF coalesce(g->'team','null')<>'null'::jsonb AND ((g->>'team')::integer NOT IN (0,1) OR ids[(g->>'team')::integer+1] IS DISTINCT FROM i) THEN RAISE EXCEPTION 'Cannot change balancing after ordinary picks';END IF;
  s:=jsonb_set(s,ARRAY['golfers',i::text,'team'],CASE WHEN i=ids[1] THEN '0'::jsonb WHEN i=ids[2] THEN '1'::jsonb ELSE 'null'::jsonb END);i:=i+1;
 END LOOP;
 FOR t IN 0..1 LOOP s:=jsonb_set(s,ARRAY['teams',t::text,'roster'],jsonb_build_array(ids[t+1]));s:=jsonb_set(s,ARRAY['teams',t::text,'captainGolferIndex'],to_jsonb(ids[t+1]));END LOOP;
 s:=s||jsonb_build_object('picks',jsonb_build_array(jsonb_build_object('golfer',ids[1],'team',0,'captain',true),jsonb_build_object('golfer',ids[2],'team',1,'captain',true)),'draftRules','weighted','balanceVersion',2,'timerPaused',true,'timerEndsAt',null);
 -- Fair version is opt-in; reject equal-strength captains pending explicit tiebreak.
 PERFORM public.elleng_weighted_options(s);
 UPDATE public.elleng_drafts SET state=s,updated_at=clock_timestamp() WHERE id=p_draft_id;RETURN s;
END;$function$
;
