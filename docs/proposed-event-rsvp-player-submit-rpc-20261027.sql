-- PROPOSED ONLY: no production execution or browser grant.
-- Authenticated, event-scoped player RSVP submission.
begin;
create or replace function public.elleng_submit_event_rsvp(
 p_tournament_id text,
 p_golfer_index integer,
 p_status text
) returns public.elleng_event_rsvps
language plpgsql security definer set search_path = ''
as $submit$
declare
 v_actor uuid := auth.uid();
 v_state jsonb;
 v_picks jsonb;
 v_row public.elleng_event_rsvps;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_status is null or p_status not in ('playing','maybe','out') then
   raise exception 'Invalid RSVP status' using errcode='22023';
 end if;
 if p_golfer_index is null or p_golfer_index < 0 then
   raise exception 'Invalid golfer index' using errcode='22023';
 end if;
 -- Lock the same draft row as the commissioner approval and captain pick RPCs.
 -- This prevents late RSVP updates racing the first draft pick.
 select d.state into v_state
 from public.elleng_tournaments t
 join public.elleng_drafts d on d.id=t.draft_id
 where t.id=p_tournament_id
 for update of d;
 if not found then
   raise exception 'Tournament not found' using errcode='P0002';
 end if;
 v_picks := coalesce(v_state->'picks','[]'::jsonb);
 if jsonb_typeof(v_picks) <> 'array'
    or jsonb_array_length(case when jsonb_typeof(v_picks)='array' then v_picks else '[]'::jsonb end) > 0
    or coalesce((v_state->>'rosterLocked')::boolean,false)
    or coalesce((v_state->>'draftStarted')::boolean,false) then
   raise exception 'Draft roster is locked; RSVP changes are closed' using errcode='55000';
 end if;
 -- Caller identity is derived from auth.uid(); never accept a supplied user ID.
 insert into public.elleng_event_rsvps(tournament_id,user_id,golfer_index,status)
 values(p_tournament_id,v_actor,p_golfer_index,p_status)
 on conflict(tournament_id,user_id) do update
 set golfer_index=excluded.golfer_index,status=excluded.status,updated_at=now()
 returning * into v_row;
 return v_row;
end;
$submit$;
revoke all on function public.elleng_submit_event_rsvp(text,integer,text) from public,anon,authenticated;
commit;
