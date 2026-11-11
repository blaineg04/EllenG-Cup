-- Commissioner-only draft restart. Does not touch scores, accounts or golfer handicaps.
create schema if not exists elleng_internal;
create table if not exists elleng_internal.draft_reset_backups (
 id bigint generated always as identity primary key,
 draft_id text not null,
 backed_up_at timestamptz not null default clock_timestamp(),
 reason text not null,
 state jsonb not null
);
revoke all on schema elleng_internal from public, anon, authenticated;
revoke all on elleng_internal.draft_reset_backups from public, anon, authenticated;

create or replace function public.elleng_reset_entire_draft(
 p_draft_id text,
 p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 d public.elleng_drafts%rowtype;
 t public.elleng_tournaments%rowtype;
 s jsonb;
 gs jsonb;
 ts jsonb;
 ps jsonb := '[]'::jsonb;
 captain_index integer;
 team_index integer;
 golfer_index integer;
 stamp timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_draft_id is distinct from 'elleng-cup' then raise exception 'Invalid draft' using errcode='22023'; end if;
 select * into t from public.elleng_tournaments where draft_id=p_draft_id for update;
 if not found or t.status is distinct from 'setup' then
  raise exception 'Reset is only allowed before tournament scoring begins';
 end if;
 select * into d from public.elleng_drafts where id=p_draft_id for update;
 if not found or d.owner_id is distinct from auth.uid() then
  raise exception 'Commissioner access required' using errcode='42501';
 end if;
 if p_expected_updated_at is null or d.updated_at is distinct from p_expected_updated_at then
  raise exception 'Draft changed on another device. Refresh and retry.' using errcode='40001';
 end if;
 if exists(select 1 from public.elleng_team_scores where tournament_id=t.id)
 or exists(select 1 from public.elleng_player_hole_scores where tournament_id=t.id)
 or exists(select 1 from public.elleng_pair_hole_scores where tournament_id=t.id)
 or exists(select 1 from public.elleng_group_assignments where draft_id=p_draft_id) then
  raise exception 'Reset blocked: scores or group assignments exist. Nothing was changed.';
 end if;
 s:=d.state;gs:=s->'golfers';ts:=s->'teams';
 if jsonb_typeof(gs) is distinct from 'array' or jsonb_array_length(ts)<>2
 or s->>'draftRules' is distinct from 'weighted' then
  raise exception 'Reset requires a two-team weighted draft';
 end if;
 for team_index in 0..1 loop
  captain_index:=(ts->team_index->>'captainGolferIndex')::integer;
  if captain_index is null or captain_index<0 or captain_index>=jsonb_array_length(gs)
   or gs->captain_index->>'participating'='false'
   or coalesce(gs->captain_index->>'name','')='' then
   raise exception 'Captain selection invalid. Nothing changed.';
  end if;
  if team_index=1 and captain_index=(ts->0->>'captainGolferIndex')::integer then
   raise exception 'Captains must be different golfers';
  end if;
 end loop;
 insert into elleng_internal.draft_reset_backups(draft_id,reason,state)
 values(p_draft_id,'Commissioner requested restart from app',s);
 for golfer_index in 0..jsonb_array_length(gs)-1 loop
  gs:=jsonb_set(gs,array[golfer_index::text,'team'],'null'::jsonb,true);
 end loop;
 for team_index in 0..1 loop
  captain_index:=(ts->team_index->>'captainGolferIndex')::integer;
  gs:=jsonb_set(gs,array[captain_index::text,'team'],to_jsonb(team_index),true);
  ts:=jsonb_set(ts,array[team_index::text,'roster'],jsonb_build_array(captain_index),true);
  ps:=ps||jsonb_build_array(jsonb_build_object('team',team_index,'golfer',captain_index,'captain',true));
 end loop;
 s:=jsonb_set(s,'{golfers}',gs,false);
 s:=jsonb_set(s,'{teams}',ts,false);
 s:=jsonb_set(s,'{picks}',ps,false);
 s:=jsonb_set(s,'{timerPaused}','true'::jsonb,true);
 s:=jsonb_set(s,'{timerEndsAt}','null'::jsonb,true);
 s:=jsonb_set(s,'{timerLength}','60'::jsonb,true);
 stamp:=clock_timestamp();
 update public.elleng_drafts set state=s,updated_at=stamp where id=p_draft_id;
 return jsonb_build_object('ok',true,'picks',jsonb_array_length(ps),'updated_at',stamp);
end $$;
revoke all on function public.elleng_reset_entire_draft(text,timestamptz) from public,anon;
grant execute on function public.elleng_reset_entire_draft(text,timestamptz) to authenticated;
