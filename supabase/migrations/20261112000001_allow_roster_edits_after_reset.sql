-- Preserve active-draft protection while allowing commissioner roster edits after reset.
-- Only the two seeded captain picks may exist; the timer must remain paused.
create or replace function public.elleng_guard_weighted_roster()
returns trigger language plpgsql set search_path to 'public' as $$
declare old_field jsonb;new_field jsonb;playing_count integer;
begin
 if old.state->>'draftRules' is distinct from 'weighted' then return new;end if;
 if new.state->>'draftRules' is distinct from 'weighted' then raise exception 'Weighted draft rules cannot be disabled through roster updates';end if;
 select count(*) into playing_count from jsonb_array_elements(old.state->'golfers') where btrim(coalesce(value->>'name',''))<>'' and coalesce((value->>'participating')::boolean,true);
 if jsonb_array_length(old.state->'picks')>=playing_count then return new;end if;
 if jsonb_array_length(coalesce(old.state->'picks','[]'::jsonb))=2
 and old.state->>'timerPaused'='true'
 and new.state->>'timerPaused'='true'
 and new.state->'picks'=old.state->'picks'
 and (old.state->'picks'->0->>'captain')::boolean is true
 and (old.state->'picks'->1->>'captain')::boolean is true
 and not exists(select 1 from public.elleng_team_scores where tournament_id='elleng-cup-live')
 and not exists(select 1 from public.elleng_player_hole_scores where tournament_id='elleng-cup-live')
 and not exists(select 1 from public.elleng_pair_hole_scores where tournament_id='elleng-cup-live')
 and not exists(select 1 from public.elleng_group_assignments where draft_id='elleng-cup')
 and exists(select 1 from public.elleng_tournaments where id='elleng-cup-live' and status='setup')
 then return new;end if;
 select jsonb_agg(jsonb_build_array(ordinality,value->'name',value->'band',value->'self_ranked') order by ordinality) into old_field from jsonb_array_elements(old.state->'golfers') with ordinality where btrim(coalesce(value->>'name',''))<>'' and coalesce((value->>'participating')::boolean,true);
 select jsonb_agg(jsonb_build_array(ordinality,value->'name',value->'band',value->'self_ranked') order by ordinality) into new_field from jsonb_array_elements(new.state->'golfers') with ordinality where btrim(coalesce(value->>'name',''))<>'' and coalesce((value->>'participating')::boolean,true);
 if old_field is distinct from new_field then raise exception 'Playing roster and handicap bands are locked until the draft is complete';end if;
 return new;
end $$;
