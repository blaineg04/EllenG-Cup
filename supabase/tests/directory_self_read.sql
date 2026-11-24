begin;
grant usage on schema auth to authenticated;
insert into public.elleng_golfer_directory(owner_id,name,player_user_id) values
('11111111-1111-4111-8111-111111111111','Linked test golfer','22222222-2222-4222-8222-222222222222'),
('11111111-1111-4111-8111-111111111111','Private test golfer',null);
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $test$
begin
 if (select count(*) from public.elleng_golfer_directory) <> 1 then raise exception 'Self read scope incorrect'; end if;
 if not exists(select 1 from public.elleng_golfer_directory where name='Linked test golfer') then raise exception 'Own profile missing'; end if;
 begin
  update public.elleng_golfer_directory set name='Unauthorized';
  raise exception 'Unexpected update permission';
 exception when insufficient_privilege then null;
 end;
end $test$;
reset role;
do $test$
begin
 if (select state from public.elleng_drafts where id='elleng-cup') <> '{"picks":[1],"completed":true}'::jsonb then raise exception 'Historical draft changed'; end if;
 if (select state from public.elleng_tournaments where id='elleng-cup-live') <> '{"status":"completed","scores":[3,4]}'::jsonb then raise exception 'Historical scores changed'; end if;
end $test$;
rollback;
