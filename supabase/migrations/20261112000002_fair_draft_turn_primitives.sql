-- Staged draft fairness primitives. No live data is changed by this migration.
-- Version 1 callers keep their existing turn order.
create or replace function public.elleng_fair_turn(
 p_pick integer, p_total integer, p_weaker integer
) returns integer
language plpgsql immutable set search_path=public
as $$
declare ordinary integer; round_index integer; position integer; relative_team integer;
begin
 if p_total<2 or p_total>32 or p_pick<2 or p_pick>=p_total or p_weaker not in (0,1) then
  raise exception 'Invalid version-2 captain draft turn';
 end if;
 ordinary:=p_pick-2;
 round_index:=ordinary/2;
 position:=ordinary%2;
 if round_index%2=0 then relative_team:=position;
 else relative_team:=1-position;
 end if;
 if p_total%2=1 and p_pick=p_total-1 and relative_team<>0 then
  return p_weaker;
 end if;
 if relative_team=0 then return p_weaker;end if;
 return 1-p_weaker;
end;
$$;

-- Version-2 continuation checker: all future choices must be compatible
-- with the same turn order used by the client and the database pick RPC.
create or replace function public.elleng_weighted_reachable_v2(
 p_n integer,p_total integer,p_left integer[],p_a integer[],p_b integer[],p_weaker integer
) returns boolean
language plpgsql immutable set search_path=public
as $$
declare turn integer; band integer; left_next integer[]; a_next integer[]; b_next integer[];
begin
 if p_n=p_total then return p_left=array[0,0,0,0];end if;
 turn:=public.elleng_fair_turn(p_n,p_total,p_weaker);
 for band in 1..4 loop
  if p_left[band]<=0 then continue;end if;
  if band<=2 and ((turn=0 and p_a[band]>0 and p_b[band]=0) or
                  (turn=1 and p_b[band]>0 and p_a[band]=0)) then continue;end if;
  left_next:=p_left;a_next:=p_a;b_next:=p_b;
  left_next[band]:=left_next[band]-1;
  if turn=0 then a_next[band]:=a_next[band]+1;
  else b_next[band]:=b_next[band]+1;end if;
  if public.elleng_weighted_reachable_v2(p_n+1,p_total,left_next,a_next,b_next,p_weaker) then
   return true;
  end if;
 end loop;
 return false;
end;
$$;
-- Do not grant client EXECUTE to these internal-only helpers.
revoke all on function public.elleng_fair_turn(integer,integer,integer) from public,anon,authenticated;
revoke all on function public.elleng_weighted_reachable_v2(integer,integer,integer[],integer[],integer[],integer) from public,anon,authenticated;
