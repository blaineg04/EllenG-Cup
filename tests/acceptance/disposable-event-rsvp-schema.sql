-- Disposable-only fixture for proposed event RSVP schema.
-- Never execute against the live Supabase project.
create schema if not exists auth;
do $roles$
begin
 if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
 if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
end
$roles$;
create function auth.uid() returns uuid language sql stable as 'select null::uuid';
create table auth.users(id uuid primary key);
create table public.elleng_drafts(
 id text primary key,
 owner_id uuid not null references auth.users(id),
 state jsonb not null default '{"picks":[]}'::jsonb
);
create table public.elleng_tournaments(id text primary key,draft_id text not null references public.elleng_drafts(id));
\i docs/proposed-event-rsvp-schema-20261027.sql
insert into auth.users(id) values
('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
('cccccccc-cccc-cccc-cccc-cccccccccccc');
insert into public.elleng_drafts(id,owner_id) values('draft-1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into public.elleng_tournaments(id,draft_id) values('nov20','draft-1'),('next','draft-1');
insert into public.elleng_event_rsvps(tournament_id,user_id,golfer_index,status) values
('nov20','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',0,'playing'),
('next','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',0,'out');
do $$
begin
 if (select count(*) from public.elleng_event_rsvps where user_id='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb') <> 2 then raise exception 'Event isolation failed'; end if;
 if exists(select 1 from public.elleng_event_rsvps where approval_status <> 'pending') then raise exception 'New RSVP was not pending'; end if;
end $$;
update public.elleng_event_rsvps set approval_status='approved',approved_by='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' where tournament_id='nov20';
update public.elleng_event_rsvps set status='out' where tournament_id='nov20';
do $$
begin
 if exists(select 1 from public.elleng_event_rsvps where tournament_id='nov20' and (approval_status <> 'pending' or approved_by is not null)) then raise exception 'Approval not invalidated'; end if;
end $$;
do $$
begin
 begin
  insert into public.elleng_event_rsvps(tournament_id,user_id,golfer_index,status,approval_status) values('nov20','cccccccc-cccc-cccc-cccc-cccccccccccc',1,'playing','approved');
  raise exception 'Unauthorized initial approval was accepted';
 exception when raise_exception then
  if sqlerrm='Unauthorized initial approval was accepted' then raise; end if;
 end;
end $$;
-- Validate commissioner approval function in the disposable database.
\i docs/proposed-event-rsvp-commissioner-approval-rpc-20261027.sql
-- Simulate Supabase's auth.uid() using a session setting, only in this fixture.
create or replace function auth.uid() returns uuid language sql stable
as 'select nullif(current_setting(''test.actor'',true),'''')::uuid';
select set_config('test.actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
update public.elleng_event_rsvps set status='playing' where tournament_id='nov20';
select public.elleng_approve_event_rsvp('nov20','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','approved');
do $check$
begin
 if not exists(select 1 from public.elleng_event_rsvps where tournament_id='nov20' and approval_status='approved' and approved_by='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') then
  raise exception 'Commissioner approval did not persist';
 end if;
end $check$;
select set_config('test.actor','cccccccc-cccc-cccc-cccc-cccccccccccc',false);
do $check$
begin
 begin
  perform public.elleng_approve_event_rsvp('nov20','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','declined');
  raise exception 'Non-commissioner was allowed to approve';
 exception when insufficient_privilege then null;
 end;
end $check$;
select set_config('test.actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
do $check$
begin
 begin
  perform public.elleng_approve_event_rsvp('next','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','approved');
  raise exception 'Out RSVP was allowed to be approved';
 exception when invalid_parameter_value then null;
 end;
end $check$;
-- Approvals cannot mutate the roster after a pick or explicit draft lock.
-- The approval RPC locks the same draft row as the actual captain pick RPC.
do $check$
begin
 if has_function_privilege('authenticated',
     'public.elleng_approve_event_rsvp(text,uuid,text)','EXECUTE') then
   raise exception 'Approval RPC accidentally executable by browser roles';
 end if;
end $check$;
update public.elleng_drafts
 set state='{"picks":[{"golfer":0,"team":0}]}'::jsonb where id='draft-1';
do $check$
begin
 begin
  perform public.elleng_approve_event_rsvp(
    'nov20','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','declined');
  raise exception 'Approval after first draft pick was accepted';
 exception when sqlstate '55000' then null;
 end;
 if not exists(select 1 from public.elleng_event_rsvps
   where tournament_id='nov20' and approval_status='approved') then
  raise exception 'Rejected post-pick decision changed RSVP';
 end if;
end $check$;
update public.elleng_drafts
 set state='{"picks":[],"rosterLocked":true}'::jsonb where id='draft-1';
do $check$
begin
 begin
  perform public.elleng_approve_event_rsvp(
    'nov20','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','declined');
  raise exception 'Approval during explicit roster lock was accepted';
 exception when sqlstate '55000' then null;
 end;
end $check$;
update public.elleng_drafts
 set state='{"picks":[],"draftStarted":true}'::jsonb where id='draft-1';
do $check$
begin
 begin
  perform public.elleng_approve_event_rsvp(
    'nov20','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','declined');
  raise exception 'Approval after draft start was accepted';
 exception when sqlstate '55000' then null;
 end;
end $check$;
update public.elleng_drafts
 set state='{"picks":{}}'::jsonb where id='draft-1';
do $check$
begin
 begin
  perform public.elleng_approve_event_rsvp(
    'nov20','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','declined');
  raise exception 'Malformed pick history was allowed to bypass roster lock';
 exception when sqlstate '55000' then null;
 end;
end $check$;
select 'PASS: event RSVP schema and commissioner approval fixture' as result;
