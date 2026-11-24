-- Allow a linked golfer to read only their own independent profile.
-- No draft, scoring, enrollment or credential writes.
drop policy if exists elleng_golfer_directory_self_read on public.elleng_golfer_directory;
create policy elleng_golfer_directory_self_read on public.elleng_golfer_directory
  for select to authenticated using (player_user_id = (select auth.uid()));
