-- DISPOSABLE SEEDED DATABASE ONLY; run after both future-event migrations.
-- This transaction never commits. It checks enrollment isolation and ownership.
begin;
do $test$
declare
 v_owner uuid;
 v_event uuid;
 v_golfer uuid;
 v_before_draft jsonb;
 v_after_draft jsonb;
 v_before_tournament jsonb;
 v_after_tournament jsonb;
begin
 select owner_id,to_jsonb(d) into v_owner,v_before_draft from public.elleng_drafts d where d.id='elleng-cup';
 select to_jsonb(t) into v_before_tournament from public.elleng_tournaments t where t.id='elleng-cup-live';
 if v_owner is null or v_before_draft is null or v_before_tournament is null then
  raise exception 'Requires disposable seeded commissioner, draft and tournament';
 end if;
 insert into public.elleng_future_events(owner_id,title,event_date)
 values(v_owner,'Disposable Future Event',current_date+30) returning id into v_event;
 insert into public.elleng_golfer_directory(owner_id,name)
 values(v_owner,'Disposable Future Golfer') returning id into v_golfer;
 insert into public.elleng_future_event_enrollments(event_id,golfer_id,participating)
 values(v_event,v_golfer,true);
 if not exists(select 1 from public.elleng_future_event_enrollments where event_id=v_event and golfer_id=v_golfer and participating)
 then raise exception 'Future enrollment missing'; end if;
 update public.elleng_future_event_enrollments set participating=false
 where event_id=v_event and golfer_id=v_golfer;
 if not exists(select 1 from public.elleng_future_event_enrollments where event_id=v_event and golfer_id=v_golfer and not participating)
 then raise exception 'Future enrollment toggle failed'; end if;
 select to_jsonb(d) into v_after_draft from public.elleng_drafts d where d.id='elleng-cup';
 select to_jsonb(t) into v_after_tournament from public.elleng_tournaments t where t.id='elleng-cup-live';
 if v_before_draft is distinct from v_after_draft or v_before_tournament is distinct from v_after_tournament
 then raise exception 'Historical tournament or draft changed'; end if;
 raise notice 'Future event and enrollment isolated from historical tournament';
end $test$;
rollback;
