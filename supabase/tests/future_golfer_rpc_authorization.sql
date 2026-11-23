-- Run only in the disposable CI database after both migrations.
-- Verify authenticated commissioner access and reject noncommissioner writes.
begin;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $auth_test$
declare v_rejected boolean := false;
begin
 begin
  perform public.elleng_create_future_event('Unauthorized event',null);
 exception when insufficient_privilege then v_rejected := true;
 end;
 if not v_rejected then raise exception 'Noncommissioner created future event'; end if;
end $auth_test$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $auth_test$
declare v_event uuid; v_golfer uuid; v_other uuid;
begin
 v_event := public.elleng_create_future_event('Authorized disposable event',current_date+30);
 if v_event is null then raise exception 'Commissioner event creation failed'; end if;
 v_golfer := public.elleng_register_directory_golfer('Authorized disposable golfer','','');
 if v_golfer is null then raise exception 'Commissioner registration failed'; end if;
 perform public.elleng_set_future_enrollment(v_event,v_golfer,true);
 if not exists(select 1 from public.elleng_future_event_enrollments
  where event_id=v_event and golfer_id=v_golfer and participating)
 then raise exception 'Commissioner enrollment failed'; end if;
end $auth_test$;
rollback;
