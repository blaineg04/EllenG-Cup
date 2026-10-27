-- PROPOSED ONLY. Attendance counts without exposing other golfers' account IDs.
-- Security invoker role grants remain withheld pending authenticated rollout.
begin;
create or replace function public.elleng_event_rsvp_counts(p_tournament_id text)
returns table(playing bigint, maybe bigint, out_count bigint, approved_playing bigint)
language plpgsql security definer set search_path = ''
as $counts$
declare
 v_actor uuid := auth.uid();
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not exists(
  select 1 from public.elleng_tournaments t
  join public.elleng_drafts d on d.id=t.draft_id
  where t.id=p_tournament_id
    and (d.owner_id=v_actor or exists(
      select 1 from public.elleng_event_rsvps e
      where e.tournament_id=t.id and e.user_id=v_actor
    ))
 ) then
  raise exception 'Event enrollment or commissioner authorization required' using errcode='42501';
 end if;
 return query select
  count(*) filter(where e.status='playing'),
  count(*) filter(where e.status='maybe'),
  count(*) filter(where e.status='out'),
  count(*) filter(where e.status='playing' and e.approval_status='approved')
 from public.elleng_event_rsvps e where e.tournament_id=p_tournament_id;
end;
$counts$;
revoke all on function public.elleng_event_rsvp_counts(text) from public,anon,authenticated;
commit;
