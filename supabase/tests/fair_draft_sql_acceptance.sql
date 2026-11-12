-- Disposable PostgreSQL-only acceptance checks; no production draft data.
begin;
create role anon; create role authenticated;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create table if not exists public.elleng_drafts(id text primary key,owner_id uuid,state jsonb,updated_at timestamptz);
create table if not exists public.elleng_captains(draft_id text,user_id uuid,team_index integer);
create or replace function public.elleng_weighted_reachable(p_n integer,p_total integer,p_left integer[],p_a integer[],p_b integer[],p_snake boolean)
returns boolean language sql immutable as $$select true$$;
\ir ../migrations/20261112000002_fair_draft_turn_primitives.sql
\ir ../migrations/20261112000003_fair_draft_weighted_options.sql
\ir ../migrations/20261112000004_fair_draft_pick_rpc.sql
\ir ../migrations/20261112000005_prepare_fair_draft_opt_in.sql
-- The new commissioner entry point must exist, while the legacy entry point stays available.
do $rpc_contract$
begin
 if to_regprocedure('public.elleng_prepare_fair_draft(text)') is null then
  raise exception 'Fair draft preparation RPC is missing';
 end if;
 if to_regprocedure('public.elleng_prepare_weighted_draft(text)') is not null then
  raise exception 'Unexpected legacy preparation stub in disposable fixture';
 end if;
 if (select prosecdef from pg_proc where oid='public.elleng_prepare_fair_draft(text)'::regprocedure) is distinct from true then
  raise exception 'Fair draft preparation must enforce commissioner authorization';
 end if;
end$rpc_contract$;
-- An unauthenticated caller must never modify an isolated commissioner draft.
insert into public.elleng_drafts(id,owner_id,state)
values ('unauth-fair-test','00000000-0000-0000-0000-000000000001'::uuid,
        '{"marker":"unchanged"}'::jsonb);
do $deny_unauth$
begin
 begin
  perform public.elleng_prepare_fair_draft('unauth-fair-test');
  raise exception 'SECURITY TEST FAILED: unauthenticated preparation was accepted';
 exception when others then
  if sqlerrm <> 'Sign in required' then raise; end if;
 end;
 if (select state from public.elleng_drafts where id='unauth-fair-test') <> '{"marker":"unchanged"}'::jsonb then
  raise exception 'Unauthenticated preparation modified a draft';
 end if;
end$deny_unauth$;
do $first$
declare n integer; weaker integer; p integer; turn integer; count0 integer; count1 integer; expected0 integer; expected1 integer;
begin
 for n in 2..32 loop
  for weaker in 0..1 loop
   count0:=1;count1:=1;
   for p in 2..n-1 loop
    turn:=public.elleng_fair_turn(p,n,weaker);
    if turn=0 then count0:=count0+1;else count1:=count1+1;end if;
   end loop;
   expected0:=n/2+case when n%2=1 and weaker=0 then 1 else 0 end;
   expected1:=n/2+case when n%2=1 and weaker=1 then 1 else 0 end;
   if count0<>expected0 or count1<>expected1 then
    raise exception 'Roster capacity mismatch for %, weaker %, got %/%',n,weaker,count0,count1;
   end if;
  end loop;
 end loop;
 if public.elleng_fair_turn(2,23,0)<>0 or public.elleng_fair_turn(2,23,1)<>1 then
  raise exception 'Weaker captain did not get first ordinary pick';
 end if;
end$first$;
do $draft$
declare n integer; weaker integer; i integer; p integer; t integer; chosen integer; golfer jsonb; golfers jsonb; teams jsonb; state jsonb; opts jsonb; selected integer[]; capacities jsonb;
begin
 for n in select unnest(array[11,13,15,22,23,24]) loop
  for weaker in 0..1 loop
   golfers:='[]'::jsonb;
   for i in 0..n-1 loop
    golfer:=jsonb_build_object('name','Test golfer '||i,'participating',true,'self_ranked',true,
      'band',case when i=0 then case when weaker=0 then 'B' else 'A' end
                  when i=1 then case when weaker=1 then 'B' else 'A' end else 'C' end,
      'team',case when i<2 then to_jsonb(i) else 'null'::jsonb end);
    golfers:=golfers||jsonb_build_array(golfer);
   end loop;
   teams:=jsonb_build_array(jsonb_build_object('captainGolferIndex',0,'roster',jsonb_build_array(0)),
                            jsonb_build_object('captainGolferIndex',1,'roster',jsonb_build_array(1)));
   state:=jsonb_build_object('golfers',golfers,'teams',teams,'draftType','snake','draftRules','weighted',
    'balanceVersion',2,'picks',jsonb_build_array(jsonb_build_object('golfer',0,'team',0),
                                                jsonb_build_object('golfer',1,'team',1)));
   for p in 2..n-1 loop
    opts:=public.elleng_weighted_options(state);
    t:=public.elleng_fair_turn(p,n,weaker);
    chosen:=null;
    for i in 2..n-1 loop
     if state->'golfers'->i->'team'='null'::jsonb
        and (opts->'eligible'->t)?(state->'golfers'->i->>'band') then chosen:=i;exit;end if;
    end loop;
    if chosen is null then raise exception 'No eligible continuation for % golfers weaker % pick %',n,weaker,p;end if;
    state:=jsonb_set(state,array['golfers',chosen::text,'team'],to_jsonb(t));
    state:=jsonb_set(state,array['teams',t::text,'roster'],state->'teams'->t->'roster'||to_jsonb(chosen));
    state:=jsonb_set(state,'{picks}',state->'picks'||jsonb_build_object('golfer',chosen,'team',t));
   end loop;
   capacities:=public.elleng_weighted_options(state)->'capacities';
   if jsonb_array_length(state->'teams'->0->'roster')<>(capacities->>0)::integer
      or jsonb_array_length(state->'teams'->1->'roster')<>(capacities->>1)::integer
      or jsonb_array_length(state->'picks')<>n then
    raise exception 'Full-draft mismatch for % golfers weaker %',n,weaker;
   end if;
  end loop;
 end loop;
end$draft$;
-- Commissioner preparation RPC: opt in, persist v2, and reject re-preparation after a pick.
create or replace function auth.uid() returns uuid language sql stable as $auth_test$
 select nullif(current_setting('elleng.test_uid',true),'')::uuid
$auth_test$;
select set_config('elleng.test_uid','00000000-0000-0000-0000-000000000001',true);
do $prepare_save$
declare st jsonb; after_prepare jsonb; golfer jsonb; i integer;
begin
 st:=jsonb_build_object(
  'golfers',jsonb_build_array(
   jsonb_build_object('name','Captain B','band','B','self_ranked',true,'participating',true,'team',0),
   jsonb_build_object('name','Captain A','band','A','self_ranked',true,'participating',true,'team',1),
   jsonb_build_object('name','Golfer 2','band','C','self_ranked',true,'participating',true,'team','null'::jsonb),
   jsonb_build_object('name','Golfer 3','band','C','self_ranked',true,'participating',true,'team','null'::jsonb),
   jsonb_build_object('name','Golfer 4','band','C','self_ranked',true,'participating',true,'team','null'::jsonb)),
  'teams',jsonb_build_array(jsonb_build_object('captain','Captain B','roster',jsonb_build_array(0)),
                           jsonb_build_object('captain','Captain A','roster',jsonb_build_array(1))),
  'picks',jsonb_build_array(jsonb_build_object('golfer',0,'team',0,'captain',true),
                            jsonb_build_object('golfer',1,'team',1,'captain',true)),
  'draftRules','weighted','balanceVersion',1,'draftType','snake','timerPaused',true);
 insert into public.elleng_drafts(id,owner_id,state) values ('rpc-prepare-test',auth.uid(),st);
 perform public.elleng_prepare_fair_draft('rpc-prepare-test');
 select state into after_prepare from public.elleng_drafts where id='rpc-prepare-test';
 if (after_prepare->>'balanceVersion')::integer<>2
    or jsonb_array_length(after_prepare->'picks')<>2
    or (after_prepare->'teams'->0->>'captainGolferIndex')::integer<>0
    or (after_prepare->'teams'->1->>'captainGolferIndex')::integer<>1
    or (after_prepare->>'timerPaused')::boolean is distinct from true then
  raise exception 'Commissioner fair preparation did not persist safe v2 captain seeds';
 end if;
 perform set_config('elleng.test_uid','00000000-0000-0000-0000-000000000002',true);
 begin
  perform public.elleng_prepare_fair_draft('rpc-prepare-test');
  raise exception 'SECURITY TEST FAILED: non-owner prepared draft';
 exception when others then
  if sqlerrm <> 'Commissioner access required' then raise; end if;
 end;
 perform set_config('elleng.test_uid','00000000-0000-0000-0000-000000000001',true);
 select state into st from public.elleng_drafts where id='rpc-prepare-test';
 if st<>after_prepare then raise exception 'Unauthorized preparation modified state';end if;
end$prepare_save$;
-- Authenticated RPC pick-save rehearsal with disposable owner and 5 golfers.
create or replace function auth.uid() returns uuid language sql stable as $auth_test$
 select nullif(current_setting('elleng.test_uid',true),'')::uuid
$auth_test$;
select set_config('elleng.test_uid','00000000-0000-0000-0000-000000000001',true);
do $pick_save$
declare st jsonb; opts jsonb; turn integer; chosen integer; i integer; p integer;
begin
 st:=jsonb_build_object(
  'golfers',jsonb_build_array(
   jsonb_build_object('name','Captain B','band','B','self_ranked',true,'participating',true,'team',0),
   jsonb_build_object('name','Captain A','band','A','self_ranked',true,'participating',true,'team',1),
   jsonb_build_object('name','Golfer 2','band','C','self_ranked',true,'participating',true,'team','null'::jsonb),
   jsonb_build_object('name','Golfer 3','band','C','self_ranked',true,'participating',true,'team','null'::jsonb),
   jsonb_build_object('name','Golfer 4','band','C','self_ranked',true,'participating',true,'team','null'::jsonb)),
  'teams',jsonb_build_array(jsonb_build_object('captainGolferIndex',0,'roster',jsonb_build_array(0)),
                           jsonb_build_object('captainGolferIndex',1,'roster',jsonb_build_array(1))),
  'picks',jsonb_build_array(jsonb_build_object('golfer',0,'team',0),jsonb_build_object('golfer',1,'team',1)),
  'draftRules','weighted','balanceVersion',2,'draftType','snake','timerPaused',false,'timerLength',60);
 insert into public.elleng_drafts(id,owner_id,state) values ('rpc-pick-test',auth.uid(),st);
 -- A different signed-in user must not pick for this commissioner-owned draft.
 perform set_config('elleng.test_uid','00000000-0000-0000-0000-000000000002',true);
 begin
  perform public.elleng_weighted_pick('rpc-pick-test',2);
  raise exception 'SECURITY TEST FAILED: unauthorized pick was accepted';
 exception when others then
  if sqlerrm <> 'Not authorized for this draft' then raise; end if;
 end;
 select state into st from public.elleng_drafts where id='rpc-pick-test';
 if jsonb_array_length(st->'picks')<>2 then raise exception 'Unauthorized pick modified draft';end if;
 perform set_config('elleng.test_uid','00000000-0000-0000-0000-000000000001',true);
 -- A paused draft must reject a manual pick without writing state.
 update public.elleng_drafts set state=jsonb_set(state,'{timerPaused}','true'::jsonb) where id='rpc-pick-test';
 begin
  perform public.elleng_weighted_pick('rpc-pick-test',2);
  raise exception 'SAFETY TEST FAILED: paused draft accepted a manual pick';
 exception when others then
  if sqlerrm <> 'Draft is paused' then raise; end if;
 end;
 select state into st from public.elleng_drafts where id='rpc-pick-test';
 if jsonb_array_length(st->'picks')<>2 then raise exception 'Paused draft was modified';end if;
 update public.elleng_drafts set state=jsonb_set(state,'{timerPaused}','false'::jsonb) where id='rpc-pick-test';
 for p in 2..4 loop
  select state into st from public.elleng_drafts where id='rpc-pick-test';
  opts:=public.elleng_weighted_options(st);
  turn:=public.elleng_fair_turn(p,5,0);
  chosen:=null;
  for i in 2..4 loop
   if st->'golfers'->i->'team'='null'::jsonb and (opts->'eligible'->turn)?'C' then chosen:=i;exit;end if;
  end loop;
  if chosen is null then raise exception 'RPC test cannot select eligible golfer at pick %',p;end if;
  perform public.elleng_weighted_pick('rpc-pick-test',chosen);
  select state into st from public.elleng_drafts where id='rpc-pick-test';
  if jsonb_array_length(st->'picks')<>p+1 or (st->'golfers'->chosen->>'team')::integer<>turn then
   raise exception 'RPC pick did not persist at pick %',p;
  end if;
 end loop;
 if jsonb_array_length(st->'teams'->0->'roster')<>3 or jsonb_array_length(st->'teams'->1->'roster')<>2 then
  raise exception 'RPC draft did not preserve weaker captain extra golfer';
 end if;
end$pick_save$;
rollback;
