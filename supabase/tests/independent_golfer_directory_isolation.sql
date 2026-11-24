-- ISOLATED DATABASE TEST ONLY. Run after applying directory migration.
-- Uses a transaction that rolls back; no historical tournament writes.
begin;
do $$
declare before_draft jsonb; after_draft jsonb; before_tournament jsonb; after_tournament jsonb; v_owner uuid; v_duplicate_rejected boolean := false;
begin
  select to_jsonb(d) into before_draft from public.elleng_drafts d where d.id='elleng-cup';
  select to_jsonb(t) into before_tournament from public.elleng_tournaments t where t.id='elleng-cup-live';
  if before_draft is null or before_tournament is null then
    raise exception 'Expected disposable seeded draft and tournament';
  end if;
  select owner_id into v_owner from public.elleng_drafts where id='elleng-cup';
  if v_owner is null then raise exception 'Seeded commissioner missing'; end if;
  -- Directory-only write with owner copied from the seeded commissioner.
  -- This tests schema isolation; authenticated RPC/RLS tests must be separate.
  insert into public.elleng_golfer_directory(owner_id,name,band,handicap)
  select owner_id, 'Directory Smoke Test Golfer', '', ''
  from public.elleng_drafts where id='elleng-cup';
  begin
    insert into public.elleng_golfer_directory(owner_id,name,band,handicap)
    values (v_owner, '  directory smoke test golfer  ', '', '');
  exception when unique_violation then
    v_duplicate_rejected := true;
  end;
  if not v_duplicate_rejected then
    raise exception 'Duplicate golfer name was not rejected';
  end if;
  select to_jsonb(d) into after_draft from public.elleng_drafts d where d.id='elleng-cup';
  select to_jsonb(t) into after_tournament from public.elleng_tournaments t where t.id='elleng-cup-live';
  if before_draft is distinct from after_draft or before_tournament is distinct from after_tournament then
    raise exception 'Historical draft or tournament changed during directory-only insert';
  end if;
  raise notice 'Directory-only insert did not modify historical draft/tournament rows';
end $$;
rollback;
