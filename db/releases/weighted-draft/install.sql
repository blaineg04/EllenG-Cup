-- REVIEW CANDIDATE. Install functions before publishing the weighted-draft client.
-- No tournament rows are modified by installation. Legacy drafts retain their rules.
BEGIN;
-- Search remaining snake turns using the same first-A/B rule as the client.
-- This is an isolated release candidate, not an installation.
CREATE OR REPLACE FUNCTION public.elleng_weighted_reachable(
 p_n integer,p_total integer,p_left integer[],p_a integer[],p_b integer[],p_snake boolean
) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $reach$
DECLARE turn integer; band integer; left_next integer[]; a_next integer[]; b_next integer[];
BEGIN
 IF p_n=p_total THEN RETURN p_left=ARRAY[0,0,0,0];END IF;
 turn:=p_n%2;
 IF p_snake AND (p_n/2)%2=1 THEN turn:=1-turn;END IF;
 FOR band IN 1..4 LOOP
  IF p_left[band]<=0 THEN CONTINUE;END IF;
  IF band<=2 AND ((turn=0 AND p_a[band]>0 AND p_b[band]=0) OR
                   (turn=1 AND p_b[band]>0 AND p_a[band]=0)) THEN CONTINUE;END IF;
  left_next:=p_left;a_next:=p_a;b_next:=p_b;
  left_next[band]:=left_next[band]-1;
  IF turn=0 THEN a_next[band]:=a_next[band]+1;
  ELSE b_next[band]:=b_next[band]+1;END IF;
  IF public.elleng_weighted_reachable(p_n+1,p_total,left_next,a_next,b_next,p_snake) THEN RETURN true;END IF;
 END LOOP;
 RETURN false;
END;$reach$;

CREATE OR REPLACE FUNCTION public.elleng_weighted_options(p_state jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE
 totals integer[]:=ARRAY[0,0,0,0]; fixed0 integer[]:=ARRAY[0,0,0,0]; fixed1 integer[]:=ARRAY[0,0,0,0];
 caps integer[]:=ARRAY[0,0]; weights integer[]:=ARRAY[5,3,2,1]; labels text[]:=ARRAY['A','B','C','D'];
 g jsonb; r jsonb; t integer; i integer; n integer:=0; b integer; idx integer; seen integer[]:='{}';
 a integer; bb integer; c integer; d integer; counts integer[]; high integer[]; strength integer; total_strength integer:=0;
 assigned integer; turn integer; remaining integer[]; aa integer[]; ab integer[]; candidate integer; feasible boolean[]:=ARRAY[false,false,false,false]; overlap boolean:=false; snake boolean;
 gap bigint; depth bigint; best_gap bigint; best_depth bigint; eligible0 boolean[]:=ARRAY[false,false,false,false]; eligible1 boolean[]:=ARRAY[false,false,false,false];
BEGIN
 IF jsonb_array_length(coalesce(p_state->'teams','[]'))<>2 THEN RAISE EXCEPTION 'Weighted balance requires two teams'; END IF;
 IF p_state->>'draftRules'='weighted' THEN FOR t IN 0..1 LOOP
  idx:=(p_state->'teams'->t->>'captainGolferIndex')::integer;
  IF idx IS NULL OR idx<0 OR p_state->'picks'->t->>'golfer' IS DISTINCT FROM idx::text OR p_state->'picks'->t->>'team' IS DISTINCT FROM t::text OR p_state->'golfers'->idx->>'team' IS DISTINCT FROM t::text OR NOT (p_state->'teams'->t->'roster') @> to_jsonb(ARRAY[idx]) THEN RAISE EXCEPTION 'Weighted captain seeds must remain assigned'; END IF;
 END LOOP;END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(p_state->'golfers') LOOP
  IF btrim(coalesce(g->>'name',''))='' OR NOT coalesce((g->>'participating')::boolean,true) THEN CONTINUE; END IF;
  b:=array_position(labels,g->>'band');
  IF b IS NULL OR g->'self_ranked' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Every playing golfer needs a submitted handicap band'; END IF;
  totals[b]:=totals[b]+1; total_strength:=total_strength+weights[b];
  t:=n%2; IF p_state->>'draftType'='snake' AND (n/2)%2=1 THEN t:=1-t; END IF;
  caps[t+1]:=caps[t+1]+1;n:=n+1;
 END LOOP;
 IF n<2 OR n>500 THEN RAISE EXCEPTION 'Weighted balance requires 2–500 playing golfers'; END IF;
 FOR t IN 0..1 LOOP
  FOR r IN SELECT value FROM jsonb_array_elements(coalesce(p_state->'teams'->t->'roster','[]')) LOOP
   idx:=(r#>>'{}')::integer;g:=p_state->'golfers'->idx;
   IF idx<0 OR idx=ANY(seen) OR g IS NULL OR btrim(coalesce(g->>'name',''))='' OR NOT coalesce((g->>'participating')::boolean,true) OR g->>'team' IS DISTINCT FROM t::text THEN RAISE EXCEPTION 'Draft roster assignments are inconsistent'; END IF;
   seen:=array_append(seen,idx);
  END LOOP;
 END LOOP;
 i:=0;
 FOR g IN SELECT value FROM jsonb_array_elements(p_state->'golfers') LOOP
  IF btrim(coalesce(g->>'name',''))<>'' AND coalesce((g->>'participating')::boolean,true) AND coalesce(g->'team','null')<>'null'::jsonb THEN
   t:=(g->>'team')::integer;
   IF t NOT IN (0,1) OR NOT i=ANY(seen) THEN RAISE EXCEPTION 'Draft roster assignments are inconsistent'; END IF;
   b:=array_position(labels,g->>'band');IF t=0 THEN fixed0[b]:=fixed0[b]+1;ELSE fixed1[b]:=fixed1[b]+1;END IF;
  END IF;i:=i+1;
 END LOOP;
 IF (SELECT sum(x) FROM unnest(fixed0)x)>caps[1] OR (SELECT sum(x) FROM unnest(fixed1)x)>caps[2] THEN RAISE EXCEPTION 'Team roster exceeds its capacity'; END IF;
 high:=ARRAY[totals[1]-fixed1[1],totals[2]-fixed1[2],totals[3]-fixed1[3],totals[4]-fixed1[4]];
 FOR a IN fixed0[1]..least(high[1],caps[1]) LOOP
 FOR bb IN fixed0[2]..least(high[2],caps[1]-a) LOOP
 FOR c IN fixed0[3]..least(high[3],caps[1]-a-bb) LOOP
  d:=caps[1]-a-bb-c;IF d<fixed0[4] OR d>high[4] THEN CONTINUE;END IF;
  counts:=ARRAY[a,bb,c,d];strength:=5*a+3*bb+2*c+d;
  gap:=abs(strength::bigint*caps[2]-(total_strength-strength)::bigint*caps[1]);depth:=0;
  FOR b IN 1..4 LOOP depth:=depth+(counts[b]::bigint*caps[2]-(totals[b]-counts[b])::bigint*caps[1])^2;END LOOP;
  IF best_gap IS NULL OR gap<best_gap OR (gap=best_gap AND depth<best_depth) THEN
   best_gap:=gap;best_depth:=depth;eligible0:=ARRAY[false,false,false,false];eligible1:=ARRAY[false,false,false,false];
  END IF;
  IF gap=best_gap AND depth=best_depth THEN FOR b IN 1..4 LOOP
   eligible0[b]:=eligible0[b] OR counts[b]>fixed0[b];eligible1[b]:=eligible1[b] OR totals[b]-counts[b]>fixed1[b];
  END LOOP;END IF;
 END LOOP;END LOOP;END LOOP;
 IF best_gap IS NULL THEN RAISE EXCEPTION 'No valid final roster allocation is possible';END IF;
 -- Match the client-side first-round premium-band restriction.
 FOR b IN 1..2 LOOP
  IF fixed0[b]>0 AND fixed1[b]=0 AND totals[b]>fixed0[b] AND caps[2]>(SELECT sum(x) FROM unnest(fixed1)x) THEN eligible0[b]:=false;END IF;
  IF fixed1[b]>0 AND fixed0[b]=0 AND totals[b]>fixed1[b] AND caps[1]>(SELECT sum(x) FROM unnest(fixed0)x) THEN eligible1[b]:=false;END IF;
 END LOOP;
 -- Future-pick feasibility: reject a choice that strands the other team.
 IF n<=32 THEN
  assigned:=(SELECT sum(x) FROM unnest(fixed0)x)+(SELECT sum(x) FROM unnest(fixed1)x);
  IF assigned<n THEN
   remaining:=ARRAY[totals[1]-fixed0[1]-fixed1[1],totals[2]-fixed0[2]-fixed1[2],totals[3]-fixed0[3]-fixed1[3],totals[4]-fixed0[4]-fixed1[4]];
   snake:=p_state->>'draftType'='snake';
   turn:=assigned%2;IF snake AND (assigned/2)%2=1 THEN turn:=1-turn;END IF;
   FOR candidate IN 1..4 LOOP
    IF remaining[candidate]<=0 THEN CONTINUE;END IF;
    IF candidate<=2 AND ((turn=0 AND fixed0[candidate]>0 AND fixed1[candidate]=0) OR
                         (turn=1 AND fixed1[candidate]>0 AND fixed0[candidate]=0)) THEN CONTINUE;END IF;
    aa:=fixed0;ab:=fixed1;remaining[candidate]:=remaining[candidate]-1;
    IF turn=0 THEN aa[candidate]:=aa[candidate]+1;ELSE ab[candidate]:=ab[candidate]+1;END IF;
    feasible[candidate]:=public.elleng_weighted_reachable(assigned+1,n,remaining,aa,ab,snake);
    remaining[candidate]:=remaining[candidate]+1;
   END LOOP;
   FOR candidate IN 1..4 LOOP
    IF turn=0 AND eligible0[candidate] AND feasible[candidate] THEN overlap:=true;END IF;
    IF turn=1 AND eligible1[candidate] AND feasible[candidate] THEN overlap:=true;END IF;
   END LOOP;
   FOR candidate IN 1..4 LOOP
    IF turn=0 THEN eligible0[candidate]:=feasible[candidate] AND (NOT overlap OR eligible0[candidate]);
    ELSE eligible1[candidate]:=feasible[candidate] AND (NOT overlap OR eligible1[candidate]);END IF;
   END LOOP;
  END IF;
 END IF;
 RETURN jsonb_build_object('version',1,'capacities',to_jsonb(caps),'score',jsonb_build_array(best_gap,best_depth),'eligible',jsonb_build_array(
  coalesce((SELECT jsonb_agg(labels[x] ORDER BY x) FROM generate_series(1,4)x WHERE eligible0[x]),'[]'::jsonb),
  coalesce((SELECT jsonb_agg(labels[x] ORDER BY x) FROM generate_series(1,4)x WHERE eligible1[x]),'[]'::jsonb)),
  'strength',jsonb_build_array((SELECT sum(fixed0[x]*weights[x]) FROM generate_series(1,4)x),(SELECT sum(fixed1[x]*weights[x]) FROM generate_series(1,4)x)));
END;$$;

CREATE OR REPLACE FUNCTION public.elleng_prepare_weighted_draft(p_draft_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
 s:=s||jsonb_build_object('picks',jsonb_build_array(jsonb_build_object('golfer',ids[1],'team',0,'captain',true),jsonb_build_object('golfer',ids[2],'team',1,'captain',true)),'draftRules','weighted','balanceVersion',1,'timerPaused',true,'timerEndsAt',null);
 PERFORM public.elleng_weighted_options(s);
 UPDATE public.elleng_drafts SET state=s,updated_at=clock_timestamp() WHERE id=p_draft_id;RETURN s;
END;$$;

CREATE OR REPLACE FUNCTION public.elleng_weighted_pick(p_draft_id text,p_golfer_index integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE uid uuid:=auth.uid();owner_uid uuid;s jsonb;opt jsonb;turn integer;cnt integer;total integer;g jsonb;chosen integer;captain_team integer;automatic boolean:=p_golfer_index IS NULL;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required';END IF;
 SELECT owner_id,state INTO owner_uid,s FROM public.elleng_drafts WHERE id=p_draft_id FOR UPDATE;
 IF s IS NULL THEN RAISE EXCEPTION 'Draft not found';END IF;
 SELECT team_index INTO captain_team FROM public.elleng_captains WHERE draft_id=p_draft_id AND user_id=uid;
 IF uid IS DISTINCT FROM owner_uid AND (captain_team IS NULL OR captain_team NOT IN (0,1)) THEN RAISE EXCEPTION 'Not authorized for this draft';END IF;
 IF s->>'draftRules' IS DISTINCT FROM 'weighted' OR s->>'balanceVersion' IS DISTINCT FROM '1' THEN RAISE EXCEPTION 'Weighted draft is not prepared';END IF;
 IF coalesce((s->>'timerPaused')::boolean,true) THEN IF automatic THEN RETURN s;ELSE RAISE EXCEPTION 'Draft is paused';END IF;END IF;
 IF automatic AND (coalesce(s->>'timerEndsAt','')='' OR now()<(s->>'timerEndsAt')::timestamptz) THEN RETURN s;END IF;
 opt:=public.elleng_weighted_options(s);cnt:=jsonb_array_length(s->'picks');total:=(opt->'capacities'->>0)::integer+(opt->'capacities'->>1)::integer;
 IF cnt>=total THEN IF automatic THEN RETURN s;ELSE RAISE EXCEPTION 'Draft is complete';END IF;END IF;
 turn:=cnt%2;IF s->>'draftType'='snake' AND (cnt/2)%2=1 THEN turn:=1-turn;END IF;
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
END;$$;

-- Older commissioner clients save whole state. Never let them append weighted
-- picks outside the authorized engine or remove the seeded captains.
CREATE OR REPLACE FUNCTION public.elleng_validate_weighted_save(p_before jsonb,p_after jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $$
DECLARE expected jsonb:=p_before;old_count integer;new_count integer;last_pick jsonb;t integer;g integer;
BEGIN
 IF p_before->>'draftRules' IS DISTINCT FROM 'weighted' THEN
  IF p_after->>'draftRules'='weighted' THEN RAISE EXCEPTION 'Use the weighted draft preparation controls';END IF;
  RETURN;
 END IF;
 IF p_after->>'draftRules' IS DISTINCT FROM 'weighted' OR p_after->>'balanceVersion' IS DISTINCT FROM '1' OR p_after->>'draftType' IS DISTINCT FROM p_before->>'draftType' THEN RAISE EXCEPTION 'Weighted draft rules are locked';END IF;
 old_count:=jsonb_array_length(p_before->'picks');new_count:=jsonb_array_length(p_after->'picks');
 IF new_count=old_count-1 AND old_count>2 THEN
  last_pick:=p_before->'picks'->(old_count-1);t:=(last_pick->>'team')::integer;g:=(last_pick->>'golfer')::integer;
  expected:=jsonb_set(expected,'{picks}',(expected->'picks')-(old_count-1));
  expected:=jsonb_set(expected,ARRAY['golfers',g::text,'team'],'null');
  expected:=jsonb_set(expected,ARRAY['teams',t::text,'roster'],(expected->'teams'->t->'roster')-(jsonb_array_length(expected->'teams'->t->'roster')-1));
 ELSIF new_count<>old_count THEN RAISE EXCEPTION 'Use the weighted pick controls; captain seeds cannot be undone';
 END IF;
 IF p_after->'golfers' IS DISTINCT FROM expected->'golfers' OR p_after->'teams' IS DISTINCT FROM expected->'teams' OR p_after->'picks' IS DISTINCT FROM expected->'picks' THEN RAISE EXCEPTION 'Use the weighted pick controls; player bands and assignments are locked';END IF;
 PERFORM public.elleng_weighted_options(p_after);
END;$$;

DO $$ DECLARE fn text;marker text:=E'  return query';addition text;
BEGIN
 fn:=pg_get_functiondef('public.elleng_save_state_if_fresh(text,timestamp with time zone,jsonb)'::regprocedure);
 IF position('elleng_validate_weighted_save' IN fn)>0 THEN RETURN;END IF;
 IF position(marker IN fn)=0 THEN RAISE EXCEPTION 'Commissioner RPC changed; review weighted save guard';END IF;
 addition:=E'  perform public.elleng_validate_weighted_save((select d.state from public.elleng_drafts d where d.id=p_draft_id and d.owner_id=v_uid for update),p_state);\n'||marker;
 EXECUTE replace(fn,marker,addition);
END;$$;

-- Profile/participation services also update draft state. Freeze the playing
-- field during a weighted draft; photos and unrelated profile fields stay editable.
CREATE OR REPLACE FUNCTION public.elleng_guard_weighted_roster()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE old_field jsonb;new_field jsonb;playing_count integer;
BEGIN
 IF OLD.state->>'draftRules' IS DISTINCT FROM 'weighted' OR NEW.state->>'draftRules' IS DISTINCT FROM 'weighted' THEN RETURN NEW;END IF;
 SELECT count(*) INTO playing_count FROM jsonb_array_elements(OLD.state->'golfers') WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
 IF jsonb_array_length(OLD.state->'picks')>=playing_count THEN RETURN NEW;END IF;
 SELECT jsonb_agg(jsonb_build_array(ordinality,value->'name',value->'band',value->'self_ranked') ORDER BY ordinality) INTO old_field FROM jsonb_array_elements(OLD.state->'golfers') WITH ORDINALITY WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
 SELECT jsonb_agg(jsonb_build_array(ordinality,value->'name',value->'band',value->'self_ranked') ORDER BY ordinality) INTO new_field FROM jsonb_array_elements(NEW.state->'golfers') WITH ORDINALITY WHERE btrim(coalesce(value->>'name',''))<>'' AND coalesce((value->>'participating')::boolean,true);
 IF old_field IS DISTINCT FROM new_field THEN RAISE EXCEPTION 'Playing roster and handicap bands are locked until the draft is complete';END IF;
 RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS elleng_weighted_roster_guard ON public.elleng_drafts;
CREATE TRIGGER elleng_weighted_roster_guard BEFORE UPDATE OF state ON public.elleng_drafts FOR EACH ROW EXECUTE FUNCTION public.elleng_guard_weighted_roster();
REVOKE ALL ON FUNCTION public.elleng_guard_weighted_roster() FROM PUBLIC,anon,authenticated;

-- Route existing captain and timeout entry points to the same versioned engine.
-- Exact marker check makes this fail closed if their installed definitions change.
DO $$ DECLARE fn text;name text;signature text;marker text:=E'if v_state is null then raise exception ''Draft not found''; end if;';addition text;
BEGIN
 FOREACH name IN ARRAY ARRAY['elleng_make_pick','elleng_auto_pick'] LOOP
  signature:=CASE WHEN name='elleng_make_pick' THEN 'public.elleng_make_pick(text,integer)' ELSE 'public.elleng_auto_pick(text)' END;
  fn:=pg_get_functiondef(signature::regprocedure);
  IF position('elleng_weighted_pick' IN fn)>0 THEN CONTINUE;END IF;
  IF position(marker IN fn)=0 THEN RAISE EXCEPTION 'Draft RPC changed; review weighted routing before installation';END IF;
  addition:=marker||E'\n  if v_state->>''draftRules''=''weighted'' then return public.elleng_weighted_pick(p_draft_id,'||CASE WHEN name='elleng_make_pick' THEN 'p_golfer_index' ELSE 'null' END||'); end if;';
  EXECUTE replace(fn,marker,addition);
 END LOOP;
END;$$;
REVOKE ALL ON FUNCTION public.elleng_validate_weighted_save(jsonb,jsonb),public.elleng_weighted_options(jsonb),public.elleng_prepare_weighted_draft(text),public.elleng_weighted_pick(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_validate_weighted_save(jsonb,jsonb),public.elleng_weighted_options(jsonb),public.elleng_prepare_weighted_draft(text),public.elleng_weighted_pick(text,integer) TO authenticated;
COMMIT;
