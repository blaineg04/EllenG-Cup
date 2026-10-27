-- PROPOSED ONLY. Trusted commissioner enrollment; no browser EXECUTE grant.
-- Requires the event RSVP schema and draft ownership records.
begin;
create or replace function public.elleng_assign_event_golfer(
 p_tournament_id text,
 p_user_id uuid,
 p_golfer_index integer
) returns public.elleng_event_rsvps
language plpgsql security definer set search_path = ''
as $assign$
declare
 v_actor uuid := auth.uid();
 v_state jsonb;
 v_picks jsonb;
 v_row public.elleng_event_rsvps;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_user_id is null or p_golfer_index is null or p_golfer_index < 0 then
   raise exception 'Valid golfer and account required' using errcode='22023';
 end if;
 -- Serialize enrollment with the captain pick and approval functions.
 select d.state into v_state from public.elleng_tournaments t
 join public.elleng_drafts d on d.id=t.draft_id
 where t.id=p_tournament_id and d.owner_id=v_actor
 for update of d;
 if not found then
   raise exception 'Only tournament commissioner may assign golfers' using errcode='42501';
 end if;
 v_picks := coalesce(v_state->'picks','[]'::jsonb);
 if jsonb_typeof(v_picks)<>'array'
    or jsonb_array_length(case when jsonb_typeof(v_picks)='array' then v_picks else '[]'::jsonb end)>0
    or coalesce((v_state->>'rosterLocked')::boolean,false)
    or coalesce((v_state->>'draftStarted')::boolean,false) then
   raise exception 'Draft roster is locked' using errcode='55000';
 end if;
 -- The golfer index must identify an actual named golfer in this draft's
 -- canonical directory, not merely an arbitrary nonnegative integer.
 if jsonb_typeof(v_state->'golfers') is distinct from 'array'
    or p_golfer_index >= jsonb_array_length(v_state->'golfers')
    or nullif(btrim(v_state->'golfers'->p_golfer_index->>'name'),'') is null then
   raise exception 'Golfer index is not in the tournament golfer directory'
     using errcode='22023';
 end if;
 if not exists(select 1 from auth.users where id=p_user_id) then
   raise exception 'Account not found' using errcode='P0002';
 end if;
 if exists(select 1 from public.elleng_event_rsvps where tournament_id=p_tournament_id
    and (user_id=p_user_id or golfer_index=p_golfer_index)) then
   raise exception 'Golfer or account already assigned for this event' using errcode='23505';
 end if;
 insert into public.elleng_event_rsvps(tournament_id,user_id,golfer_index,status)
 values(p_tournament_id,p_user_id,p_golfer_index,'maybe')
 returning * into v_row;
 return v_row;
end;
$assign$;
revoke all on function public.elleng_assign_event_golfer(text,uuid,integer)
 from public,anon,authenticated;
commit;
