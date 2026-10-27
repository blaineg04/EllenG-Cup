-- PROPOSED ONLY: do not apply to live EllenG Cup without reviewed rollout.
-- Separate event RSVPs from legacy draft-scoped elleng_rsvps.
-- Requires existing public.elleng_tournaments(id text, draft_id text, ...).
begin;
create table if not exists public.elleng_event_rsvps (
 tournament_id text not null references public.elleng_tournaments(id) on delete restrict,
 user_id uuid not null references auth.users(id) on delete cascade,
 golfer_index integer not null check (golfer_index >= 0),
 status text not null check (status in ('playing','maybe','out')),
 approval_status text not null default 'pending' check (approval_status in ('pending','approved','declined')),
 approved_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 primary key (tournament_id,user_id),
 constraint approval_requires_playing check (approval_status <> 'approved' or status='playing')
);
create unique index if not exists elleng_event_approved_golfer_unique
 on public.elleng_event_rsvps(tournament_id,golfer_index)
 where status='playing' and approval_status='approved';
alter table public.elleng_event_rsvps enable row level security;
-- Database guard: a player cannot submit a fabricated approved RSVP through any write path.
create or replace function public.elleng_event_rsvp_approval_guard()
returns trigger language plpgsql security invoker set search_path = '' as $rsvp_guard$
begin
 if tg_op='INSERT' and (new.approval_status <> 'pending' or new.approved_by is not null) then
   raise exception 'New RSVP must begin pending';
 end if;
 if tg_op='UPDATE' and (new.status is distinct from old.status or new.golfer_index is distinct from old.golfer_index) then
   new.approval_status := 'pending';
   new.approved_by := null;
 end if;
 return new;
end;
$rsvp_guard$;
drop trigger if exists elleng_event_rsvp_approval_guard on public.elleng_event_rsvps;
create trigger elleng_event_rsvp_approval_guard before insert or update on public.elleng_event_rsvps
for each row execute function public.elleng_event_rsvp_approval_guard();
revoke all on public.elleng_event_rsvps from public,anon,authenticated;
grant select on public.elleng_event_rsvps to authenticated;
-- Reading event attendance is limited to the player and the draft owner.
drop policy if exists "event rsvp owner or commissioner read" on public.elleng_event_rsvps;
create policy "event rsvp owner or commissioner read" on public.elleng_event_rsvps
 for select to authenticated using (
   user_id=(select auth.uid()) or exists (
     select 1 from public.elleng_tournaments t
     join public.elleng_drafts d on d.id=t.draft_id
     where t.id=tournament_id and d.owner_id=(select auth.uid())
   )
 );
-- Browser read grants only; a later authenticated RPC must enforce event ownership.
-- No browser write policies intentionally. Changes must be performed through
-- separately reviewed, authenticated RPCs that enforce event state and roster lock.
-- This prevents clients from self-approving or changing golfer_index.
commit;
