-- PROPOSED ONLY: player clears attendance but keeps verified golfer identity.
-- Deleting the association would allow re-claiming a golfer and lose audit context.
begin;
create or replace function public.elleng_clear_event_rsvp(
 p_tournament_id text
) returns public.elleng_event_rsvps
language plpgsql security definer set search_path = ''
as $clear$
declare
 v_actor uuid := auth.uid();
 v_state jsonb;
 v_picks jsonb;
 v_row public.elleng_event_rsvps;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select d.state into v_state
 from public.elleng_tournaments t
 join public.elleng_drafts d on d.id=t.draft_id
 where t.id=p_tournament_id
 for update of d;
 if not found then raise exception 'Tournament not found' using errcode='P0002'; end if;
 v_picks:=coalesce(v_state->'picks','[]'::jsonb);
 if jsonb_typeof(v_picks)<>'array'
   or jsonb_array_length(case when jsonb_typeof(v_picks)='array' then v_picks else '[]'::jsonb end)>0
   or coalesce((v_state->>'rosterLocked')::boolean,false)
   or coalesce((v_state->>'draftStarted')::boolean,false) then
   raise exception 'Draft roster is locked; RSVP changes are closed' using errcode='55000';
 end if;
 -- Preserve enrollment; use NULL attendance to represent no response.
 update public.elleng_event_rsvps
 set status=null,approval_status='pending',approved_by=null,updated_at=now()
 where tournament_id=p_tournament_id and user_id=v_actor
 returning * into v_row;
 if not found then raise exception 'Verified event golfer association required' using errcode='42501'; end if;
 return v_row;
end;
$clear$;
revoke all on function public.elleng_clear_event_rsvp(text) from public,anon,authenticated;
commit;
