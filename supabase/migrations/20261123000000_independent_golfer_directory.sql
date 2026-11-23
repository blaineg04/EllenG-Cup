-- Additive, tournament-independent golfer directory.
-- Does not update elleng_drafts, tournament rows, picks, scores or teams.
create table if not exists public.elleng_golfer_directory (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(btrim(name)) between 1 and 160),
  band text not null default '' check (band in ('','A','B','C','D')),
  handicap text not null default '',
  photo_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists elleng_golfer_directory_owner_idx on public.elleng_golfer_directory(owner_id);
-- Prevent duplicate names for the same commissioner, case/space insensitive.
create unique index if not exists elleng_golfer_directory_owner_name_unique
  on public.elleng_golfer_directory(owner_id, lower(btrim(name)));
alter table public.elleng_golfer_directory enable row level security;
revoke all on public.elleng_golfer_directory from public, anon, authenticated;
grant select on public.elleng_golfer_directory to authenticated;
drop policy if exists elleng_golfer_directory_owner_read on public.elleng_golfer_directory;
create policy elleng_golfer_directory_owner_read on public.elleng_golfer_directory
  for select to authenticated using (owner_id = (select auth.uid()));

create or replace function public.elleng_register_directory_golfer(
  p_name text, p_band text default '', p_handicap text default '', p_photo_url text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := auth.uid(); v_id uuid; v_name text := btrim(coalesce(p_name,''));
begin
  if v_owner is null or not exists (
    select 1 from public.elleng_drafts d
    where d.id = 'elleng-cup' and d.owner_id = v_owner
  ) then raise exception 'Commissioner authorization required' using errcode = '42501'; end if;
  if length(v_name) not between 1 and 160 then raise exception 'Invalid golfer name'; end if;
  if coalesce(p_band,'') not in ('','A','B','C','D') then raise exception 'Invalid band'; end if;
  if length(coalesce(p_handicap,'')) > 40 or length(coalesce(p_photo_url,'')) > 2048 then
    raise exception 'Golfer field too long';
  end if;
  -- A directory entry is not a tournament enrollment; no historical draft writes.
  insert into public.elleng_golfer_directory(owner_id,name,band,handicap,photo_url)
  values(v_owner,v_name,coalesce(p_band,''),coalesce(p_handicap,''),coalesce(p_photo_url,''))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.elleng_register_directory_golfer(text,text,text,text) from public, anon;
grant execute on function public.elleng_register_directory_golfer(text,text,text,text) to authenticated;
