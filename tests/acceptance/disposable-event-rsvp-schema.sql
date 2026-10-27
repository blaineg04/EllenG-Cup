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
create table public.elleng_drafts(id text primary key,owner_id uuid not null references auth.users(id));
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
select 'PASS: event RSVP schema fixture' as result;
