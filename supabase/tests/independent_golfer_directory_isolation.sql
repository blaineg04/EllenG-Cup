-- ISOLATED DATABASE TEST ONLY. Run after applying directory migration.
-- Uses a transaction that rolls back; no historical tournament writes.
begin;
do $$
declare before_draft jsonb; after_draft jsonb; before_tournament jsonb; after_tournament jsonb;
begin
  select to_jsonb(d) into before_draft from public.elleng_drafts d where d.id='elleng-cup';
  select to_jsonb(t) into before_tournament from public.elleng_tournaments t where t.id='elleng-cup-live';
  if before_draft is null or before_tournament is null then
    raise exception 'Expected disposable seeded draft and tournament';
  end if;
  -- Directory-only write with owner copied from the seeded commissioner.
  -- This tests schema isolation; authenticated RPC/RLS tests must be separate.
  insert into public.elleng_golfer_directory(owner_id,name,band,handicap)
  select owner_id, 'Directory Smoke Test Golfer', '', ''
  from public.elleng_drafts where id='elleng-cup';
  select to_jsonb(d) into after_draft from public.elleng_drafts d where d.id='elleng-cup';
  select to_jsonb(t) into after_tournament from public.elleng_tournaments t where t.id='elleng-cup-live';
  if before_draft is distinct from after_draft or before_tournament is distinct from after_tournament then
    raise exception 'Historical draft or tournament changed during directory-only insert';
  end if;
  raise notice 'Directory-only insert did not modify historical draft/tournament rows';
end $$;
rollback;
