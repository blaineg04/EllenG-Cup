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
rollback;
