-- ISOLATED DATABASE TEST HARNESS ONLY.
-- Run in a disposable PostgreSQL database, never the live EllenG Cup project.
-- This deliberately defines an independent test-only table and function.
-- It does NOT replace elleng_guard_weighted_roster or grant any production access.
BEGIN;
CREATE SCHEMA IF NOT EXISTS transfer_fixture;
CREATE TABLE IF NOT EXISTS transfer_fixture.drafts (
  id text PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION transfer_fixture.guard_delta()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
  old_g jsonb;
  new_g jsonb;
  changed integer := 0;
  idx integer;
  old_teams jsonb;
  new_teams jsonb;
  member jsonb;
  team_idx integer;
  member_idx integer;
  seen integer[];
BEGIN
  IF OLD.state->>'draftRules' IS DISTINCT FROM 'weighted'
     OR NEW.state->>'draftRules' IS DISTINCT FROM 'weighted'
  THEN RAISE EXCEPTION 'weighted draft required'; END IF;
  IF OLD.state->'picks' IS DISTINCT FROM NEW.state->'picks'
     OR OLD.state - 'golfers' - 'teams' IS DISTINCT FROM NEW.state - 'golfers' - 'teams'
  THEN RAISE EXCEPTION 'unrelated draft metadata changed'; END IF;
  IF jsonb_typeof(OLD.state->'golfers') <> 'array'
     OR jsonb_typeof(NEW.state->'golfers') <> 'array'
     OR jsonb_array_length(OLD.state->'golfers') <> jsonb_array_length(NEW.state->'golfers')
  THEN RAISE EXCEPTION 'invalid golfer array'; END IF;
  IF jsonb_typeof(OLD.state->'teams') <> 'array'
     OR jsonb_typeof(NEW.state->'teams') <> 'array'
     OR jsonb_array_length(OLD.state->'teams') <> 2
     OR jsonb_array_length(NEW.state->'teams') <> 2
  THEN RAISE EXCEPTION 'invalid teams'; END IF;
  FOR idx IN 0..jsonb_array_length(OLD.state->'golfers')-1 LOOP
    old_g := OLD.state#>ARRAY['golfers',idx::text];
    new_g := NEW.state#>ARRAY['golfers',idx::text];
    IF old_g IS DISTINCT FROM new_g THEN
      changed := changed+1;
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(OLD.state->'teams') AS t(value)
        WHERE lower(btrim(coalesce(t.value->>'captain',''))) =
              lower(btrim(coalesce(old_g->>'name','')))
           OR t.value->'captain' = to_jsonb(idx)
           OR t.value->'captain'->>'golferIndex' = idx::text
      ) THEN RAISE EXCEPTION 'captain transfer forbidden'; END IF;
      IF old_g-'team' IS DISTINCT FROM new_g-'team'
      THEN RAISE EXCEPTION 'golfer metadata changed'; END IF;
      IF old_g->>'team' NOT IN ('0','1') OR new_g->>'team' NOT IN ('0','1')
         OR old_g->>'team'=new_g->>'team'
      THEN RAISE EXCEPTION 'invalid team change'; END IF;
    END IF;
  END LOOP;
  IF changed NOT IN (1,2) THEN RAISE EXCEPTION 'expected one move or two swapped golfers'; END IF;
  old_teams:=OLD.state->'teams';
  new_teams:=NEW.state->'teams';
  IF (old_teams->0)-'roster' IS DISTINCT FROM (new_teams->0)-'roster'
     OR (old_teams->1)-'roster' IS DISTINCT FROM (new_teams->1)-'roster'
  THEN RAISE EXCEPTION 'team metadata changed'; END IF;
  IF old_teams->0->'roster' IS NOT DISTINCT FROM new_teams->0->'roster'
     OR old_teams->1->'roster' IS NOT DISTINCT FROM new_teams->1->'roster'
  THEN RAISE EXCEPTION 'both rosters must change'; END IF;
  -- Validate every roster entry against its authoritative golfer.team.
  -- Supports numeric entries and objects with a numeric golferIndex.
  seen := array_fill(0, ARRAY[jsonb_array_length(NEW.state->'golfers')]);
  FOR team_idx IN 0..1 LOOP
    IF jsonb_typeof(new_teams->team_idx->'roster') <> 'array'
    THEN RAISE EXCEPTION 'roster must be array'; END IF;
    FOR member IN SELECT value FROM jsonb_array_elements(new_teams->team_idx->'roster') LOOP
      IF jsonb_typeof(member) = 'number' THEN
        IF member::text !~ '^(0|[1-9][0-9]*)
      IF member_idx < 0 OR member_idx >= array_length(seen,1)
      THEN RAISE EXCEPTION 'roster index out of bounds'; END IF;
      seen[member_idx+1] := seen[member_idx+1]+1;
      IF seen[member_idx+1] > 1
      THEN RAISE EXCEPTION 'golfer duplicated across rosters'; END IF;
      IF NEW.state#>>ARRAY['golfers',member_idx::text,'team'] <> team_idx::text
      THEN RAISE EXCEPTION 'roster does not match golfer team'; END IF;
    END LOOP;
  END LOOP;
  FOR idx IN 0..jsonb_array_length(NEW.state->'golfers')-1 LOOP
    IF NEW.state#>>ARRAY['golfers',idx::text,'team'] IN ('0','1')
       AND seen[idx+1] <> 1
    THEN RAISE EXCEPTION 'assigned golfer missing from roster'; END IF;
  END LOOP;
  -- Not production-ready: production auth, status and score
  -- checks MUST be implemented and exercised before adapting to production.
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_delta ON transfer_fixture.drafts;
CREATE TRIGGER guard_delta BEFORE UPDATE OF state ON transfer_fixture.drafts
FOR EACH ROW EXECUTE FUNCTION transfer_fixture.guard_delta();
COMMIT;
        THEN RAISE EXCEPTION 'invalid numeric roster index'; END IF;
        member_idx := (member::text)::integer;
      ELSIF jsonb_typeof(member) = 'object' THEN
        IF jsonb_typeof(member->'golferIndex') IS DISTINCT FROM 'number'
           OR (member->>'golferIndex') !~ '^(0|[1-9][0-9]*)
      IF member_idx < 0 OR member_idx >= array_length(seen,1)
      THEN RAISE EXCEPTION 'roster index out of bounds'; END IF;
      seen[member_idx+1] := seen[member_idx+1]+1;
      IF seen[member_idx+1] > 1
      THEN RAISE EXCEPTION 'golfer duplicated across rosters'; END IF;
      IF NEW.state#>>ARRAY['golfers',member_idx::text,'team'] <> team_idx::text
      THEN RAISE EXCEPTION 'roster does not match golfer team'; END IF;
    END LOOP;
  END LOOP;
  FOR idx IN 0..jsonb_array_length(NEW.state->'golfers')-1 LOOP
    IF NEW.state#>>ARRAY['golfers',idx::text,'team'] IN ('0','1')
       AND seen[idx+1] <> 1
    THEN RAISE EXCEPTION 'assigned golfer missing from roster'; END IF;
  END LOOP;
  -- Not production-ready: object-form roster membership, auth, status and score
  -- checks MUST be implemented and exercised before adapting to production.
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_delta ON transfer_fixture.drafts;
CREATE TRIGGER guard_delta BEFORE UPDATE OF state ON transfer_fixture.drafts
FOR EACH ROW EXECUTE FUNCTION transfer_fixture.guard_delta();
COMMIT;
        THEN RAISE EXCEPTION 'invalid object roster index'; END IF;
        member_idx := (member->>'golferIndex')::integer;
      ELSE
        RAISE EXCEPTION 'invalid roster entry';
      END IF;
      IF member_idx < 0 OR member_idx >= array_length(seen,1)
      THEN RAISE EXCEPTION 'roster index out of bounds'; END IF;
      seen[member_idx+1] := seen[member_idx+1]+1;
      IF seen[member_idx+1] > 1
      THEN RAISE EXCEPTION 'golfer duplicated across rosters'; END IF;
      IF NEW.state#>>ARRAY['golfers',member_idx::text,'team'] <> team_idx::text
      THEN RAISE EXCEPTION 'roster does not match golfer team'; END IF;
    END LOOP;
  END LOOP;
  FOR idx IN 0..jsonb_array_length(NEW.state->'golfers')-1 LOOP
    IF NEW.state#>>ARRAY['golfers',idx::text,'team'] IN ('0','1')
       AND seen[idx+1] <> 1
    THEN RAISE EXCEPTION 'assigned golfer missing from roster'; END IF;
  END LOOP;
  -- Not production-ready: object-form roster membership, auth, status and score
  -- checks MUST be implemented and exercised before adapting to production.
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS guard_delta ON transfer_fixture.drafts;
CREATE TRIGGER guard_delta BEFORE UPDATE OF state ON transfer_fixture.drafts
FOR EACH ROW EXECUTE FUNCTION transfer_fixture.guard_delta();
COMMIT;