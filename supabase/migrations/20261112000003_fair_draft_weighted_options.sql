-- Version-2 fair draft allocation. Version-1 behavior is retained.
CREATE OR REPLACE FUNCTION public.elleng_weighted_options(p_state jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
 totals integer[]:=ARRAY[0,0,0,0]; fixed0 integer[]:=ARRAY[0,0,0,0]; fixed1 integer[]:=ARRAY[0,0,0,0];
 caps integer[]:=ARRAY[0,0]; weights integer[]:=ARRAY[5,3,2,1]; labels text[]:=ARRAY['A','B','C','D'];
 g jsonb; r jsonb; t integer; i integer; n integer:=0; b integer; idx integer; seen integer[]:='{}';
 a integer; bb integer; c integer; d integer; counts integer[]; high integer[]; strength integer; total_strength integer:=0;
 assigned integer; turn integer; remaining integer[]; aa integer[]; ab integer[]; candidate integer; feasible boolean[]:=ARRAY[false,false,false,false]; overlap boolean:=false; snake boolean; fair_v2 boolean:=false; weaker integer; captain0 integer; captain1 integer; strength0 integer; strength1 integer;
 gap bigint; depth bigint; best_gap bigint; best_depth bigint; eligible0 boolean[]:=ARRAY[false,false,false,false]; eligible1 boolean[]:=ARRAY[false,false,false,false];
BEGIN
 IF jsonb_array_length(coalesce(p_state->'teams','[]'))<>2 THEN RAISE EXCEPTION 'Weighted balance requires two teams'; END IF;
 IF p_state->>'draftRules'='weighted' THEN FOR t IN 0..1 LOOP
  idx:=(p_state->'teams'->t->>'captainGolferIndex')::integer;
  IF idx IS NULL OR idx<0 OR p_state->'picks'->t->>'golfer' IS DISTINCT FROM idx::text OR p_state->'picks'->t->>'team' IS DISTINCT FROM t::text OR p_state->'golfers'->idx->>'team' IS DISTINCT FROM t::text OR NOT (p_state->'teams'->t->'roster') @> to_jsonb(ARRAY[idx]) THEN RAISE EXCEPTION 'Weighted captain seeds must remain assigned'; END IF;
 END LOOP;END IF;
 fair_v2:=p_state->>'draftRules'='weighted' AND p_state->>'balanceVersion'='2';
 IF fair_v2 THEN
  captain0:=(p_state->'teams'->0->>'captainGolferIndex')::integer;
  captain1:=(p_state->'teams'->1->>'captainGolferIndex')::integer;
  strength0:=array_position(labels,p_state->'golfers'->captain0->>'band');
  strength1:=array_position(labels,p_state->'golfers'->captain1->>'band');
  IF strength0 IS NULL OR strength1 IS NULL THEN RAISE EXCEPTION 'Captains must be ranked';END IF;
  strength0:=weights[strength0];strength1:=weights[strength1];
  IF strength0=strength1 THEN RAISE EXCEPTION 'Equal captains require a neutral tiebreak before preparation';END IF;
  weaker:=CASE WHEN strength0<strength1 THEN 0 ELSE 1 END;
 END IF;
 FOR g IN SELECT value FROM jsonb_array_elements(p_state->'golfers') LOOP
  IF btrim(coalesce(g->>'name',''))='' OR NOT coalesce((g->>'participating')::boolean,true) THEN CONTINUE; END IF;
  b:=array_position(labels,g->>'band');
  IF b IS NULL OR g->'self_ranked' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Every playing golfer needs a submitted handicap band'; END IF;
  totals[b]:=totals[b]+1; total_strength:=total_strength+weights[b];
  IF NOT fair_v2 THEN
   t:=n%2; IF p_state->>'draftType'='snake' AND (n/2)%2=1 THEN t:=1-t; END IF;
   caps[t+1]:=caps[t+1]+1;
  END IF;
  n:=n+1;
 END LOOP;
 IF n<2 OR n>32 THEN RAISE EXCEPTION 'Weighted balance requires 2–32 playing golfers'; END IF;
 IF fair_v2 THEN
  caps:=ARRAY[n/2,n/2];
  IF n%2=1 THEN caps[weaker+1]:=caps[weaker+1]+1;END IF;
 END IF;
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
   IF fair_v2 THEN turn:=public.elleng_fair_turn(assigned,n,weaker);
   ELSE turn:=assigned%2;IF snake AND (assigned/2)%2=1 THEN turn:=1-turn;END IF;END IF;
   FOR candidate IN 1..4 LOOP
    IF remaining[candidate]<=0 THEN CONTINUE;END IF;
    IF candidate<=2 AND ((turn=0 AND fixed0[candidate]>0 AND fixed1[candidate]=0) OR
                         (turn=1 AND fixed1[candidate]>0 AND fixed0[candidate]=0)) THEN CONTINUE;END IF;
    aa:=fixed0;ab:=fixed1;remaining[candidate]:=remaining[candidate]-1;
    IF turn=0 THEN aa[candidate]:=aa[candidate]+1;ELSE ab[candidate]:=ab[candidate]+1;END IF;
    IF fair_v2 THEN feasible[candidate]:=public.elleng_weighted_reachable_v2(assigned+1,n,remaining,aa,ab,weaker);
    ELSE feasible[candidate]:=public.elleng_weighted_reachable(assigned+1,n,remaining,aa,ab,snake);END IF;
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
END;$function$
;
