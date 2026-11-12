-- Disposable PostgreSQL-only acceptance checks; no production draft data.
begin;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$select null::uuid$$;
create table if not exists public.elleng_drafts(id text primary key,owner_id uuid,state jsonb,updated_at timestamptz);
create table if not exists public.elleng_captains(draft_id text,user_id uuid,team_index integer);
create or replace function public.elleng_weighted_reachable(p_n integer,p_total integer,p_left integer[],p_a integer[],p_b integer[],p_snake boolean)
returns boolean language sql immutable as $$select true$$;
\ir ../migrations/20261112000002_fair_draft_turn_primitives.sql
\ir ../migrations/20261112000003_fair_draft_weighted_options.sql
\ir ../migrations/20261112000004_fair_draft_pick_rpc.sql
do $$
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
end$$;
rollback;
