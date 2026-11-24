-- Run only in the disposable CI database after both migrations.
-- Verify authenticated commissioner access and reject noncommissioner writes.
begin;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
update public.elleng_drafts set state=state || '{"golfers":[{"name":"Historical test golfer"},{"name":" historical test golfer "}]}'::jsonb where id='elleng-cup';
create temp table historical_import_snapshot as select state from public.elleng_drafts where id='elleng-cup';
set local role authenticated;
create temp table authorization_fixture_ids(event_id uuid,golfer_id uuid) on commit drop;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $auth_test$
declare v_rejected boolean := false;
begin
 begin
  perform public.elleng_create_future_event('Unauthorized event',null);
 exception when insufficient_privilege then v_rejected := true;
 end;
 if not v_rejected then raise exception 'Noncommissioner created future event'; end if;
 v_rejected := false;
 begin
  perform public.elleng_import_directory_roster();
 exception when insufficient_privilege then v_rejected := true;
 end;
 if not v_rejected then raise exception 'Noncommissioner imported historical roster'; end if;
end $auth_test$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $auth_test$
declare v_event uuid; v_golfer uuid; v_other uuid;
begin
 if public.elleng_import_directory_roster() <> 1 then raise exception 'Historical import count incorrect'; end if;
 if public.elleng_import_directory_roster() <> 0 then raise exception 'Repeated import duplicated golfers'; end if;
 v_event := public.elleng_create_future_event('Authorized disposable event',current_date+30);
 if v_event is null then raise exception 'Commissioner event creation failed'; end if;
 v_golfer := public.elleng_register_directory_golfer('Authorized disposable golfer','','');
 if v_golfer is null then raise exception 'Commissioner registration failed'; end if;
 perform public.elleng_set_future_enrollment(v_event,v_golfer,true);
 insert into authorization_fixture_ids values(v_event,v_golfer);
 if (select count(*) from public.elleng_future_draft_roster(v_event)) <> 1 then raise exception 'Draft roster must contain only enrolled golfers'; end if;
 perform public.elleng_set_future_enrollment(v_event,v_golfer,false);
 if exists(select 1 from public.elleng_future_draft_roster(v_event)) then raise exception 'Withdrawn golfer remains in future draft roster'; end if;
 perform public.elleng_set_future_enrollment(v_event,v_golfer,true);
 if not exists(select 1 from public.elleng_future_event_enrollments
  where event_id=v_event and golfer_id=v_golfer and participating)
 then raise exception 'Commissioner enrollment failed'; end if;
end $auth_test$;
-- Verify noncommissioners cannot modify another commissioner's enrollment or link.
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $auth_test$
declare v_event uuid; v_golfer uuid; v_denied boolean := false;
begin
 select event_id,golfer_id into v_event,v_golfer from authorization_fixture_ids;
 if v_event is null or v_golfer is null then raise exception 'Authorization fixtures missing'; end if;
 begin
  perform public.elleng_set_future_enrollment(v_event,v_golfer,false);
 exception when insufficient_privilege then v_denied := true;
 end;
 if not v_denied then raise exception 'Noncommissioner changed another event enrollment'; end if;
 v_denied := false;
 begin
  perform public.elleng_future_draft_roster(v_event);
 exception when insufficient_privilege then v_denied := true;
 end;
 if not v_denied then raise exception 'Noncommissioner read future draft roster'; end if;
 v_denied := false;
 begin
  perform public.elleng_link_directory_golfer(v_golfer,'22222222-2222-4222-8222-222222222222');
 exception when insufficient_privilege then v_denied := true;
 end;
 if not v_denied then raise exception 'Noncommissioner linked another golfer account'; end if;
end $auth_test$;
reset role;
do $snapshot$
begin
 if (select state from public.elleng_drafts where id='elleng-cup') is distinct from (select state from historical_import_snapshot) then
  raise exception 'Historical draft changed during directory import or enrollment';
 end if;
end $snapshot$;
rollback;
