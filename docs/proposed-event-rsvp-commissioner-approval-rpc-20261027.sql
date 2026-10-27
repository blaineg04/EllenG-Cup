-- PROPOSED ONLY. Apply only after reviewed authenticated rollout.
-- This function deliberately does not grant execute to browser roles until
-- end-to-end Supabase Auth/RLS acceptance has been completed.
begin;
create or replace function public.elleng_approve_event_rsvp(
 p_tournament_id text,
 p_user_id uuid,
 p_decision text
) returns public.elleng_event_rsvps
language plpgsql security definer set search_path = ''
as $approval$
declare
 v_actor uuid := auth.uid();
 v_result public.elleng_event_rsvps;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_decision not in ('approved','declined') or p_decision is null then
   raise exception 'Invalid approval decision' using errcode='22023';
 end if;
 -- Resolve authority from database ownership, never from a client role claim.
 if not exists (
   select 1 from public.elleng_tournaments t
   join public.elleng_drafts d on d.id=t.draft_id
   where t.id=p_tournament_id and d.owner_id=v_actor
 ) then
   raise exception 'Only tournament commissioner may approve' using errcode='42501';
 end if;
 -- Lock the selected RSVP row to serialize decisions with RSVP updates.
 select * into v_result from public.elleng_event_rsvps
 where tournament_id=p_tournament_id and user_id=p_user_id
 for update;
 if not found then raise exception 'Event RSVP not found' using errcode='P0002'; end if;
 if p_decision='approved' and v_result.status <> 'playing' then
   raise exception 'Only playing RSVPs can be approved' using errcode='22023';
 end if;
 update public.elleng_event_rsvps
 set approval_status=p_decision,approved_by=v_actor,updated_at=now()
 where tournament_id=p_tournament_id and user_id=p_user_id
 returning * into v_result;
 return v_result;
end;
$approval$;
revoke all on function public.elleng_approve_event_rsvp(text,uuid,text) from public,anon,authenticated;
commit;
