-- EllenG Cup: Commissioner + six captain accounts + public spectators
create table if not exists public.elleng_drafts (
  id text primary key,
  owner_id uuid references auth.users(id),
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.elleng_captains (
  draft_id text not null references public.elleng_drafts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_index integer not null check (team_index between 0 and 5),
  primary key (draft_id,user_id),
  unique (draft_id,team_index)
);
alter table public.elleng_drafts enable row level security;
alter table public.elleng_captains enable row level security;

revoke all on public.elleng_drafts from anon,authenticated;
revoke all on public.elleng_captains from anon,authenticated;
grant select on public.elleng_drafts to anon,authenticated;
grant insert,update on public.elleng_drafts to authenticated;
grant select on public.elleng_captains to authenticated;

drop policy if exists "public read" on public.elleng_drafts;
drop policy if exists "authenticated insert" on public.elleng_drafts;
drop policy if exists "authorized update" on public.elleng_drafts;
create policy "public read" on public.elleng_drafts for select to anon,authenticated using(true);
create policy "authenticated insert" on public.elleng_drafts for insert to authenticated
with check ((select auth.uid())=owner_id);
create policy "authorized update" on public.elleng_drafts for update to authenticated
using (
  (select auth.uid())=owner_id OR exists(
    select 1 from public.elleng_captains c
    where c.draft_id=elleng_drafts.id and c.user_id=(select auth.uid())
  )
)
with check (
  (select auth.uid())=owner_id OR exists(
    select 1 from public.elleng_captains c
    where c.draft_id=elleng_drafts.id and c.user_id=(select auth.uid())
  )
);

drop policy if exists "captain sees own assignment" on public.elleng_captains;
create policy "captain sees own assignment" on public.elleng_captains for select to authenticated
using (user_id=(select auth.uid()) OR exists(
 select 1 from public.elleng_drafts d where d.id=draft_id and d.owner_id=(select auth.uid())
));

do $$ begin
 alter publication supabase_realtime add table public.elleng_drafts;
exception when duplicate_object then null; end $$;

-- After creating 6 captain users in Authentication > Users,
-- add their UUIDs below in SQL Editor:
-- insert into public.elleng_captains(draft_id,user_id,team_index) values
-- ('elleng-cup','CAPTAIN_1_UUID',0),
-- ('elleng-cup','CAPTAIN_2_UUID',1),
-- ('elleng-cup','CAPTAIN_3_UUID',2),
-- ('elleng-cup','CAPTAIN_4_UUID',3),
-- ('elleng-cup','CAPTAIN_5_UUID',4),
-- ('elleng-cup','CAPTAIN_6_UUID',5);
