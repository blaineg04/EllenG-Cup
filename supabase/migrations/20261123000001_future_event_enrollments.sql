-- Future tournament registration is independent of historical draft/scoring tables.
-- A commissioner must explicitly create an event before any enrollment.
create table if not exists public.elleng_future_events (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id),
 title text not null check (length(btrim(title)) between 1 and 120),
 event_date date,
 created_at timestamptz not null default now()
);
create table if not exists public.elleng_future_event_enrollments (
 event_id uuid not null references public.elleng_future_events(id) on delete cascade,
 golfer_id uuid not null references public.elleng_golfer_directory(id) on delete cascade,
 participating boolean not null default false,
 created_at timestamptz not null default now(),
 primary key(event_id,golfer_id)
);
alter table public.elleng_future_events enable row level security;
alter table public.elleng_future_event_enrollments enable row level security;
revoke all on public.elleng_future_events,public.elleng_future_event_enrollments from public,anon,authenticated;
grant select on public.elleng_future_events,public.elleng_future_event_enrollments to authenticated;
create policy elleng_future_events_owner_read on public.elleng_future_events
 for select to authenticated using (owner_id=(select auth.uid()));
create policy elleng_future_enrollments_owner_read on public.elleng_future_event_enrollments
 for select to authenticated using (
 exists(select 1 from public.elleng_future_events e where e.id=event_id and e.owner_id=(select auth.uid()))
 );
-- Explicit event creation only. No legacy tournament identifiers are reused.
create or replace function public.elleng_create_future_event(p_title text,p_event_date date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid(); v_id uuid;
begin
 if v_owner is null or not exists(select 1 from public.elleng_drafts d where d.id='elleng-cup' and d.owner_id=v_owner)
 then raise exception 'Commissioner authorization required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_title,''))) not between 1 and 120 then raise exception 'Invalid event title'; end if;
 insert into public.elleng_future_events(owner_id,title,event_date)
 values(v_owner,btrim(p_title),p_event_date) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.elleng_create_future_event(text,date) from public,anon;
grant execute on function public.elleng_create_future_event(text,date) to authenticated;
-- An enrollment cannot cross commissioner ownership boundaries.
create or replace function public.elleng_set_future_enrollment(p_event_id uuid,p_golfer_id uuid,p_participating boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_owner uuid:=auth.uid();
begin
 if v_owner is null or not exists(
 select 1 from public.elleng_future_events e where e.id=p_event_id and e.owner_id=v_owner
 ) or not exists(
 select 1 from public.elleng_golfer_directory g where g.id=p_golfer_id and g.owner_id=v_owner
 ) then raise exception 'Event or golfer unavailable' using errcode='42501'; end if;
 insert into public.elleng_future_event_enrollments(event_id,golfer_id,participating)
 values(p_event_id,p_golfer_id,coalesce(p_participating,false))
 on conflict(event_id,golfer_id) do update set participating=excluded.participating;
end $$;
revoke all on function public.elleng_set_future_enrollment(uuid,uuid,boolean) from public,anon;
grant execute on function public.elleng_set_future_enrollment(uuid,uuid,boolean) to authenticated;

-- Read-only draft preparation: return only enrolled golfers for the selected event.
create or replace function public.elleng_future_draft_roster(p_event_id uuid)
returns table(golfer_id uuid,name text,band text,handicap text)
language plpgsql security definer set search_path='' as $roster$
begin
 if not exists(select 1 from public.elleng_future_events e where e.id=p_event_id and e.owner_id=auth.uid())
 then raise exception 'Event unavailable' using errcode='42501'; end if;
 return query select g.id,g.name,g.band,g.handicap
 from public.elleng_future_event_enrollments en
 join public.elleng_golfer_directory g on g.id=en.golfer_id
 where en.event_id=p_event_id and en.participating and g.owner_id=auth.uid()
 order by g.name,g.id;
end $roster$;
revoke all on function public.elleng_future_draft_roster(uuid) from public,anon;
grant execute on function public.elleng_future_draft_roster(uuid) to authenticated;

-- Each future event has its own immutable initial roster snapshot.
create table public.elleng_future_draft_sessions (
 event_id uuid primary key references public.elleng_future_events(id) on delete cascade,
 roster jsonb not null check(jsonb_typeof(roster)='array'),
 created_at timestamptz not null default now()
);
alter table public.elleng_future_draft_sessions enable row level security;
revoke all on public.elleng_future_draft_sessions from public,anon,authenticated;
grant select on public.elleng_future_draft_sessions to authenticated;
create policy future_draft_session_owner_read on public.elleng_future_draft_sessions
 for select to authenticated using (exists(select 1 from public.elleng_future_events e where e.id=event_id and e.owner_id=auth.uid()));
create function public.elleng_prepare_future_draft(p_event_id uuid)
returns integer language plpgsql security definer set search_path='' as $prepare$
declare v_roster jsonb; v_count integer;
begin
 perform 1 from public.elleng_future_events where id=p_event_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Event unavailable' using errcode='42501'; end if;
 select roster into v_roster from public.elleng_future_draft_sessions where event_id=p_event_id;
 if found then return jsonb_array_length(v_roster); end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.name,r.golfer_id),'[]'::jsonb) into v_roster
 from public.elleng_future_draft_roster(p_event_id) r;
 v_count:=jsonb_array_length(v_roster);
 if v_count not between 2 and 40 then raise exception 'Draft requires 2 to 40 participating golfers'; end if;
 insert into public.elleng_future_draft_sessions(event_id,roster) values(p_event_id,v_roster);
 return v_count;
end $prepare$;
revoke all on function public.elleng_prepare_future_draft(uuid) from public,anon;
grant execute on function public.elleng_prepare_future_draft(uuid) to authenticated;
