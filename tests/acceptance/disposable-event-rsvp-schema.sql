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
insert into public.elleng_drafts(id,owner_id,state)
values('draft-1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
'{"picks":[],"golfers":[{"name":"Golfer 0"},{"name":"Golfer 1"},{"name":"Golfer 2"},{"name":"Golfer 3"},{"name":"Golfer 4"}]}'::jsonb);
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
 set state=jsonb_set(state,'{picks}','[{"golfer":0,"team":0}]'::jsonb,true) where id='draft-1';
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
 set state=jsonb_set(jsonb_set(state,'{picks}','[]'::jsonb,true),'{rosterLocked}','true'::jsonb,true) where id='draft-1';
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
 set state=jsonb_set(jsonb_set(state,'{picks}','[]'::jsonb,true),'{draftStarted}','true'::jsonb,true) where id='draft-1';
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
 set state=jsonb_set(state,'{picks}','{}'::jsonb,true) where id='draft-1';
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

-- Validate player-owned submission and draft-lock behavior in the disposable DB.
\i docs/proposed-event-rsvp-player-submit-rpc-20261027.sql
-- Restore an open draft after the preceding negative lock tests.
update public.elleng_drafts set state=jsonb_set(jsonb_set(jsonb_set(state,'{picks}','[]'::jsonb,true),'{rosterLocked}','false'::jsonb,true),'{draftStarted}','false'::jsonb,true) where id='draft-1';
select set_config('test.actor','cccccccc-cccc-cccc-cccc-cccccccccccc',false);
do $identity$
begin
 begin
  perform public.elleng_submit_event_rsvp('nov20',2,'playing');
  raise exception 'Unverified golfer enrollment was accepted';
 exception when insufficient_privilege then null;
 end;
end $identity$;
-- Simulate a trusted commissioner-provisioned association, not a player claim.
insert into public.elleng_event_rsvps(tournament_id,user_id,golfer_index,status)
 values('nov20','cccccccc-cccc-cccc-cccc-cccccccccccc',2,'maybe');
select public.elleng_submit_event_rsvp('nov20',2,'playing');
do $player$
begin
 if not exists(select 1 from public.elleng_event_rsvps where tournament_id='nov20'
  and user_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and status='playing'
  and approval_status='pending') then
   raise exception 'Player-owned RSVP submission did not persist';
 end if;
 if has_function_privilege('authenticated','public.elleng_submit_event_rsvp(text,integer,text)','EXECUTE') then
   raise exception 'Unvalidated player RSVP RPC has browser execute privilege';
 end if;
end $player$;
select set_config('test.actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
update public.elleng_drafts set state=jsonb_set(state,'{picks}','[{"golfer":0,"team":0}]'::jsonb,true) where id='draft-1';
select set_config('test.actor','cccccccc-cccc-cccc-cccc-cccccccccccc',false);
do $player$
begin
 begin
  perform public.elleng_submit_event_rsvp('nov20',2,'out');
  raise exception 'Post-pick player RSVP change was accepted';
 exception when sqlstate '55000' then null;
 end;
 if not exists(select 1 from public.elleng_event_rsvps where tournament_id='nov20'
  and user_id='cccccccc-cccc-cccc-cccc-cccccccccccc' and status='playing') then
   raise exception 'Rejected post-pick RSVP mutated existing attendance';
 end if;
end $player$;
-- Even a simultaneous first-claim race must be rejected by a database index.
update public.elleng_drafts set state=jsonb_set(jsonb_set(jsonb_set(state,'{picks}','[]'::jsonb,true),'{rosterLocked}','false'::jsonb,true),'{draftStarted}','false'::jsonb,true) where id='draft-1';
insert into auth.users(id) values('dddddddd-dddd-dddd-dddd-dddddddddddd');
select set_config('test.actor','dddddddd-dddd-dddd-dddd-dddddddddddd',false);
do $identity$
begin
 begin
  perform public.elleng_submit_event_rsvp('nov20',2,'playing');
  raise exception 'Duplicate golfer identity was accepted';
 exception when insufficient_privilege then null;
 end;
 if (select count(*) from public.elleng_event_rsvps where tournament_id='nov20' and golfer_index=2) <> 1 then
   raise exception 'Duplicate golfer identity was persisted';
 end if;
end $identity$;
-- The original account cannot switch to another golfer_index either.
select set_config('test.actor','cccccccc-cccc-cccc-cccc-cccccccccccc',false);
do $identity$
begin
 begin
  perform public.elleng_submit_event_rsvp('nov20',3,'maybe');
  raise exception 'Existing player changed golfer identity through RSVP';
 exception when insufficient_privilege then null;
 end;
 if not exists(select 1 from public.elleng_event_rsvps
   where tournament_id='nov20' and user_id='cccccccc-cccc-cccc-cccc-cccccccccccc'
   and golfer_index=2 and status='playing') then
   raise exception 'Rejected identity switch mutated original RSVP';
 end if;
end $identity$;
-- Commissioner enrollment is the trusted origin of a golfer-account association.
\i docs/proposed-event-rsvp-commissioner-enrollment-rpc-20261027.sql
insert into auth.users(id) values('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
select set_config('test.actor','cccccccc-cccc-cccc-cccc-cccccccccccc',false);
do $enroll$
begin
 begin
  perform public.elleng_assign_event_golfer('nov20','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',4);
  raise exception 'Non-commissioner enrolled a golfer';
 exception when insufficient_privilege then null;
 end;
end $enroll$;
select set_config('test.actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
select public.elleng_assign_event_golfer('nov20','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',4);
do $enroll$
begin
 if not exists(select 1 from public.elleng_event_rsvps where tournament_id='nov20'
  and user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'
  and golfer_index=4 and status='maybe' and approval_status='pending') then
  raise exception 'Commissioner enrollment did not persist';
 end if;
 if has_function_privilege('authenticated','public.elleng_assign_event_golfer(text,uuid,integer)','EXECUTE') then
  raise exception 'Unvalidated commissioner enrollment exposed to browser roles';
 end if;
 begin
  perform public.elleng_assign_event_golfer('nov20','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',4);
  raise exception 'Duplicate account assignment was accepted';
 exception when unique_violation then null;
 end;
end $enroll$;
select set_config('test.actor','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',false);
select public.elleng_submit_event_rsvp('nov20',4,'playing');
update public.elleng_drafts set state=jsonb_set(state,'{picks}','[{"golfer":0,"team":0}]'::jsonb,true) where id='draft-1';
select set_config('test.actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
do $enroll$
begin
 begin
  perform public.elleng_assign_event_golfer('nov20','dddddddd-dddd-dddd-dddd-dddddddddddd',5);
  raise exception 'Enrollment after first pick was accepted';
 exception when sqlstate '55000' then null;
 end;
end $enroll$;
-- Clearing attendance must retain the trusted golfer/account link.
update public.elleng_drafts set state=jsonb_set(jsonb_set(jsonb_set(state,'{picks}','[]'::jsonb,true),'{rosterLocked}','false'::jsonb,true),'{draftStarted}','false'::jsonb,true) where id='draft-1';
\i docs/proposed-event-rsvp-clear-rpc-20261027.sql
select set_config('test.actor','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',false);
select public.elleng_clear_event_rsvp('nov20');
do $clear$
begin
 if not exists(select 1 from public.elleng_event_rsvps where tournament_id='nov20'
  and user_id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' and golfer_index=4
  and status is null and approval_status='pending') then
  raise exception 'Clear response did not preserve verified enrollment';
 end if;
 if has_function_privilege('authenticated','public.elleng_clear_event_rsvp(text)','EXECUTE') then
  raise exception 'Unvalidated clear response RPC exposed to browser roles';
 end if;
end $clear$;
select public.elleng_submit_event_rsvp('nov20',4,'playing');
update public.elleng_drafts set state=jsonb_set(state,'{picks}','[{"golfer":0,"team":0}]'::jsonb,true) where id='draft-1';
do $clear$
begin
 begin
  perform public.elleng_clear_event_rsvp('nov20');
  raise exception 'Clear after draft pick was accepted';
 exception when sqlstate '55000' then null;
 end;
end $clear$;
select 'PASS: player RSVP, commissioner enrollment and clear response fixture' as result;

-- Private aggregate RPC must scope counts to one event and deny unrelated accounts.
\i docs/proposed-event-rsvp-counts-rpc-20261027.sql
update public.elleng_drafts
 set state=jsonb_set(jsonb_set(jsonb_set(state,'{picks}','[]'::jsonb,true),'{rosterLocked}','false'::jsonb,true),'{draftStarted}','false'::jsonb,true)
 where id='draft-1';
select set_config('test.actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
do $counts$
declare v record;
begin
 select * into v from public.elleng_event_rsvp_counts('nov20');
 -- Previous tests leave three playing RSVPs: one approved, two pending.
 -- The out response belongs to 'next', not 'nov20'.
 if (select count(*) from public.elleng_event_rsvps where tournament_id='nov20' and status='playing' and approval_status='approved') <> 1
    or (select count(*) from public.elleng_event_rsvps where tournament_id='nov20' and status='playing' and approval_status='pending') <> 2
    or (select count(*) from public.elleng_event_rsvps where tournament_id='next' and status='out') <> 1 then
  raise exception 'Attendance fixture state changed unexpectedly';
 end if;
 if v.playing<>3 or v.maybe<>0 or v.out_count<>0 or v.approved_playing<>1 then
  raise exception 'Event attendance summary unexpected: %',row_to_json(v);
 end if;
 if has_function_privilege('authenticated','public.elleng_event_rsvp_counts(text)','EXECUTE') then
  raise exception 'Unvalidated attendance summary exposed to browser roles';
 end if;
end $counts$;
select set_config('test.actor','dddddddd-dddd-dddd-dddd-dddddddddddd',false);
do $counts$
begin
 begin
  perform public.elleng_event_rsvp_counts('nov20');
  raise exception 'Unenrolled account received attendance counts';
 exception when insufficient_privilege then null;
 end;
end $counts$;
select 'PASS: event attendance summary is scoped and access controlled' as result;
