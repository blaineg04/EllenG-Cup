-- REVIEW ONLY. NOT APPROVED FOR LIVE INSTALLATION.

-- This is a candidate for disposable PostgreSQL validation, NOT a release artifact.

-- Blocked by existing direct score table DML and incomplete SECURITY DEFINER review.

BEGIN;

-- SOURCE: db/patches/20261028_split_pair_team_total_range_REVIEW_ONLY.sql
-- REVIEW ONLY — do NOT apply independently or to live production.
-- Confirmed existing constraint: elleng_team_scores_score_check CHECK(score >= 1 AND score <= 20).
-- Split-Pair combines two independently valid pair scores (each 1..20), so total 2..40.
-- Only deploy together with a server-authorized, atomic, format-aware Split-Pair RPC.
-- In particular: standard (non-Split-Pair) team scores must still be limited to 20
-- by trusted server-side validation; widening this CHECK alone is insufficient.

ALTER TABLE public.elleng_team_scores
  DROP CONSTRAINT elleng_team_scores_score_check;
ALTER TABLE public.elleng_team_scores
  ADD CONSTRAINT elleng_team_scores_score_check
  CHECK (score IS NULL OR (score >= 1 AND score <= 40));


-- SOURCE: db/patches/20261028_team_score_format_trigger_REVIEW_ONLY.sql
-- REVIEW ONLY: proposed format-aware team-score guard.
-- NEVER apply to hosted Supabase without owner/RLS/locking review and approval.
-- Must be installed ATOMICALLY alongside widened 1..40 CHECK, both RPCs,
-- and reviewed tournament/draft locking. By itself does not close races.
CREATE OR REPLACE FUNCTION public.elleng_enforce_team_score_format()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
DECLARE v_format text;
        v_draft_id text;
BEGIN
 -- Lock the parent draft in SHARE mode before reading its format.
 -- This conflicts with concurrent UPDATE OF state and prevents a stale
 -- format read racing with the draft-format change guard.
 SELECT t.draft_id INTO v_draft_id FROM public.elleng_tournaments t
 WHERE t.id=NEW.tournament_id;
 IF v_draft_id IS NULL THEN RAISE EXCEPTION 'Tournament missing' USING ERRCODE='23514'; END IF;
 SELECT coalesce(d.state->>'playFormat','standard') INTO v_format
 FROM public.elleng_drafts d WHERE d.id=v_draft_id FOR SHARE;
 IF v_format IS NULL OR v_format NOT IN ('standard','elleng','split_pair') THEN
   RAISE EXCEPTION 'Unsupported tournament scoring format' USING ERRCODE='23514';
 END IF;
 IF NEW.score IS NOT NULL AND
    ((v_format='split_pair' AND NEW.score NOT BETWEEN 2 AND 40)
      OR (v_format<>'split_pair' AND NEW.score NOT BETWEEN 1 AND 20)) THEN
   RAISE EXCEPTION 'Team score outside tournament format range' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $guard$;
-- Proposed trigger DDL, deliberately not installed by this file:
-- CREATE TRIGGER elleng_enforce_team_score_format
-- BEFORE INSERT OR UPDATE ON public.elleng_team_scores
-- FOR EACH ROW EXECUTE FUNCTION public.elleng_enforce_team_score_format();
-- Beware: captain execution as SECURITY INVOKER requires permission to
-- SELECT tournaments and drafts. Parent row locking is a separate gate.

-- Guard format changes on the draft itself, including transitions where
-- an existing score happens to fall inside both numeric ranges.
-- Concurrent score writes must also lock the parent draft/tournament:
-- this trigger alone does not establish a cross-table serialization guarantee.
CREATE OR REPLACE FUNCTION public.elleng_prevent_scored_draft_format_change()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $guard$
BEGIN
 IF coalesce(NEW.state->>'playFormat','standard') IS DISTINCT FROM
    coalesce(OLD.state->>'playFormat','standard')
 AND EXISTS (
   SELECT 1 FROM public.elleng_tournaments t WHERE t.draft_id=OLD.id
   AND (EXISTS(SELECT 1 FROM public.elleng_team_scores s WHERE s.tournament_id=t.id)
     OR EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores p WHERE p.tournament_id=t.id)
     OR EXISTS(SELECT 1 FROM public.elleng_player_hole_scores g WHERE g.tournament_id=t.id))
 ) THEN
   RAISE EXCEPTION 'Cannot change format after tournament scoring begins' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $guard$;
-- Install with reviewed migrations only:
-- CREATE TRIGGER elleng_prevent_scored_draft_format_change
-- BEFORE UPDATE OF state ON public.elleng_drafts
-- FOR EACH ROW EXECUTE FUNCTION public.elleng_prevent_scored_draft_format_change();



-- SOURCE: db/patches/20261028_tournament_config_score_guard_REVIEW_ONLY.sql
-- REVIEW ONLY: never execute against the hosted EllenG database without approval.
-- Requires disposable concurrency/RLS acceptance before migration.
-- Server-side race closure for team-count and format changes.
-- Lock ordering for score writers: tournament row first, then draft/score tables.
CREATE OR REPLACE FUNCTION public.elleng_guard_scored_tournament_config()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
 IF NEW.team_count IS DISTINCT FROM OLD.team_count AND
   (EXISTS(SELECT 1 FROM public.elleng_team_scores s WHERE s.tournament_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.elleng_pair_hole_scores s WHERE s.tournament_id=OLD.id)
    OR EXISTS(SELECT 1 FROM public.elleng_player_hole_scores s WHERE s.tournament_id=OLD.id))
 THEN
  RAISE EXCEPTION 'Reconcile tournament scores before changing team count' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
-- Tournament UPDATE locks its row, but direct score INSERT currently does not.
-- Score INSERT/UPDATE lock serializes with tournament configuration.
-- Score DELETE only removes rows and cannot add an out-of-range team.
-- IMPORTANT: use an audited NOLOGIN function owner with narrow SELECT/UPDATE
-- privileges on the tournament table. SECURITY DEFINER bypasses caller identity
-- for the parent lock, NOT for the score INSERT/UPDATE table policies.
-- Verify owners, trigger execution and deadlock order under real Supabase roles.
CREATE OR REPLACE FUNCTION public.elleng_lock_parent_for_score_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_team_count integer;
BEGIN
 SELECT t.team_count INTO v_team_count
 FROM public.elleng_tournaments t WHERE t.id=NEW.tournament_id FOR UPDATE;
 IF v_team_count IS NULL OR NEW.team_index < 0 OR NEW.team_index >= v_team_count THEN
  RAISE EXCEPTION 'Scoring team is outside active tournament' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.elleng_lock_parent_for_score_write() FROM PUBLIC, anon, authenticated;
-- Apply matching BEFORE INSERT OR UPDATE triggers to ALL THREE score tables,
-- alongside BEFORE UPDATE OF team_count on elleng_tournaments, only in an
-- approved, atomic rollout. This file does NOT install any triggers or grants.



-- SOURCE: db/patches/20261028_shamble_dynamic_draft_policies_REVIEW_ONLY.sql
-- REVIEW ONLY. DO NOT APPLY to hosted EllenG without approval, backup,
-- authenticated role tests and the coordinated score-RPC rollout.
-- Replaces the three player-score write policies that currently hardcode
-- draft_id='elleng-cup'. The existing restrictive active-event policies remain.
-- IMPORTANT: these policies by themselves still permit direct Shamble DML;
-- they are a compatibility fix, NOT the final RPC-only security boundary.

DROP POLICY IF EXISTS shamble_team_insert ON public.elleng_player_hole_scores;
CREATE POLICY shamble_team_insert ON public.elleng_player_hole_scores
 FOR INSERT TO authenticated WITH CHECK (
 EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  JOIN public.elleng_drafts d ON d.id=t.draft_id
  WHERE t.id=elleng_player_hole_scores.tournament_id
    AND (d.owner_id=(SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.elleng_captains c
      WHERE c.draft_id=t.draft_id
        AND c.team_index=elleng_player_hole_scores.team_index
        AND c.user_id=(SELECT auth.uid())
    ))
 ));
DROP POLICY IF EXISTS shamble_team_update ON public.elleng_player_hole_scores;
CREATE POLICY shamble_team_update ON public.elleng_player_hole_scores
 FOR UPDATE TO authenticated
 USING (
 EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  JOIN public.elleng_drafts d ON d.id=t.draft_id
  WHERE t.id=elleng_player_hole_scores.tournament_id
    AND (d.owner_id=(SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.elleng_captains c
      WHERE c.draft_id=t.draft_id
        AND c.team_index=elleng_player_hole_scores.team_index
        AND c.user_id=(SELECT auth.uid())
    ))
 ))
 WITH CHECK (
 EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  JOIN public.elleng_drafts d ON d.id=t.draft_id
  WHERE t.id=elleng_player_hole_scores.tournament_id
    AND (d.owner_id=(SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.elleng_captains c
      WHERE c.draft_id=t.draft_id
        AND c.team_index=elleng_player_hole_scores.team_index
        AND c.user_id=(SELECT auth.uid())
    ))
 ));
DROP POLICY IF EXISTS shamble_team_delete ON public.elleng_player_hole_scores;
CREATE POLICY shamble_team_delete ON public.elleng_player_hole_scores
 FOR DELETE TO authenticated USING (
 EXISTS (
  SELECT 1 FROM public.elleng_tournaments t
  JOIN public.elleng_drafts d ON d.id=t.draft_id
  WHERE t.id=elleng_player_hole_scores.tournament_id
    AND (d.owner_id=(SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.elleng_captains c
      WHERE c.draft_id=t.draft_id
        AND c.team_index=elleng_player_hole_scores.team_index
        AND c.user_id=(SELECT auth.uid())
    ))
 ));


-- SOURCE: db/patches/20261028_split_pair_atomic_rpc_REVIEW_ONLY.sql
-- REVIEW ONLY. Do not deploy before disposable-Postgres role and concurrency acceptance.
-- Requires the separate reviewed team-total range patch (maximum 40).
CREATE OR REPLACE FUNCTION public.elleng_test_authorized_split_pair(
 p_tournament_id text, p_team_index integer, p_hole integer,
 p_pair_index integer, p_score integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
 v_uid uuid := auth.uid();
 v_draft_id text;
 v_state jsonb;
 v_owner uuid;
 v_team jsonb;
 v_roster jsonb;
 v_golfer_count integer;
 v_i integer;
 v_idx integer;
 v_indexes integer[] := ARRAY[]::integer[];
 v_a integer;
 v_b integer;
 v_total integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 IF p_tournament_id IS NULL OR btrim(p_tournament_id) = '' OR p_team_index IS NULL OR p_hole IS NULL OR p_pair_index IS NULL
    OR p_hole NOT BETWEEN 1 AND 18 OR p_pair_index NOT BETWEEN 0 AND 1
    OR (p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 20)
 THEN RAISE EXCEPTION 'Invalid Split-Pair score request'; END IF;

 -- Lock the existing parent row before reading draft and score state; this also
 -- serializes two callers for the same tournament across different devices.
 SELECT t.draft_id INTO v_draft_id
 FROM public.elleng_tournaments t
 WHERE t.id = p_tournament_id AND t.status IN ('setup','live')
 FOR UPDATE;
 IF v_draft_id IS NULL THEN RAISE EXCEPTION 'Tournament not available'; END IF;
 SELECT d.owner_id,d.state INTO v_owner,v_state
 FROM public.elleng_drafts d WHERE d.id=v_draft_id;
 IF v_state IS NULL THEN RAISE EXCEPTION 'Draft unavailable'; END IF;

 IF v_owner IS NULL THEN RAISE EXCEPTION 'Draft owner missing'; END IF;
 IF v_uid IS DISTINCT FROM v_owner AND NOT EXISTS (
   SELECT 1 FROM public.elleng_captains c
   WHERE c.draft_id=v_draft_id AND c.user_id=v_uid
     AND c.team_index=p_team_index
 ) THEN RAISE EXCEPTION 'Not authorized to score this team'; END IF;
 -- The owner or captain must be assigned to an active tournament team.
 IF p_team_index NOT BETWEEN 0 AND (
   SELECT t.team_count-1 FROM public.elleng_tournaments t WHERE t.id=p_tournament_id
 ) THEN RAISE EXCEPTION 'Team is outside active tournament'; END IF;
 IF v_state->>'playFormat' IS DISTINCT FROM 'split_pair'
 THEN RAISE EXCEPTION 'Split-Pair format not selected'; END IF;
 IF jsonb_typeof(v_state->'teams') IS DISTINCT FROM 'array'
    OR p_team_index NOT BETWEEN 0 AND jsonb_array_length(v_state->'teams')-1
 THEN RAISE EXCEPTION 'Team not found'; END IF;

 v_team:=v_state->'teams'->p_team_index;
 v_roster:=v_team->'roster';
 IF jsonb_typeof(v_roster) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_roster)<>4
    OR jsonb_typeof(v_state->'golfers') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Four drafted golfers required'; END IF;
 v_golfer_count:=jsonb_array_length(v_state->'golfers');
 FOR v_i IN 0..3 LOOP
   IF jsonb_typeof(v_roster->v_i) NOT IN ('number','string')
      OR (v_roster->>v_i) !~ '^(0|[1-9][0-9]*)$'
      OR length(v_roster->>v_i)>9
   THEN RAISE EXCEPTION 'Invalid golfer index'; END IF;
   v_idx:=(v_roster->>v_i)::integer;
   IF v_idx>=v_golfer_count OR v_idx=ANY(v_indexes)
     OR nullif(btrim(coalesce(v_state->'golfers'->v_idx->>'name','')),'') IS NULL
   THEN RAISE EXCEPTION 'Invalid or duplicate roster golfer'; END IF;
   v_indexes:=array_append(v_indexes,v_idx);
 END LOOP;

 IF p_score IS NULL THEN
   DELETE FROM public.elleng_pair_hole_scores
   WHERE tournament_id=p_tournament_id AND team_index=p_team_index
     AND hole=p_hole AND pair_index=p_pair_index;
 ELSE
   INSERT INTO public.elleng_pair_hole_scores
     (tournament_id,team_index,hole,pair_index,score,updated_by,updated_at)
   VALUES (p_tournament_id,p_team_index,p_hole,p_pair_index,p_score,v_uid,now())
   ON CONFLICT (tournament_id,hole,team_index,pair_index)
   DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=now();
 END IF;
 SELECT max(score) FILTER (WHERE pair_index=0),max(score) FILTER (WHERE pair_index=1)
 INTO v_a,v_b FROM public.elleng_pair_hole_scores
 WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole;
 IF v_a BETWEEN 1 AND 20 AND v_b BETWEEN 1 AND 20 THEN
   v_total:=v_a+v_b;
   INSERT INTO public.elleng_team_scores
     (tournament_id,team_index,hole,score,updated_by,updated_at)
   VALUES (p_tournament_id,p_team_index,p_hole,v_total,v_uid,now())
   ON CONFLICT (tournament_id,team_index,hole)
   DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=now();
 ELSE
   DELETE FROM public.elleng_team_scores
   WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole;
 END IF;
 RETURN jsonb_build_object('hole',p_hole,'team_index',p_team_index,
   'pair_0',v_a,'pair_1',v_b,'team_score',v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_test_authorized_split_pair(text,integer,integer,integer,integer) TO authenticated;



-- SOURCE: db/patches/20261029_scramble_authorized_rpc_REVIEW_ONLY.sql
-- REVIEW ONLY: validated standard front-nine Scramble scoring.
-- Install only in one approved migration with score-table permission lockdown.
CREATE OR REPLACE FUNCTION public.elleng_test_authorized_scramble(
 p_tournament_id text,p_team_index integer,p_hole integer,p_score integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
 v_uid uuid := auth.uid();
 v_draft text;
 v_state jsonb;
 v_owner uuid;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_tournament_id IS NULL OR btrim(p_tournament_id)=''
  OR p_team_index IS NULL OR p_team_index<0
  OR p_hole IS NULL OR p_hole NOT BETWEEN 1 AND 9
  OR (p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 20)
 THEN RAISE EXCEPTION 'Invalid Scramble score' USING ERRCODE='22023'; END IF;
 SELECT t.draft_id INTO v_draft
 FROM public.elleng_tournaments t
 WHERE t.id=p_tournament_id AND t.status IN ('setup','live')
   AND p_team_index<t.team_count FOR UPDATE;
 IF v_draft IS NULL THEN RAISE EXCEPTION 'Tournament unavailable' USING ERRCODE='42501'; END IF;
 SELECT d.owner_id,d.state INTO v_owner,v_state
 FROM public.elleng_drafts d WHERE d.id=v_draft FOR SHARE;
 IF v_owner IS NULL OR v_state IS NULL THEN RAISE EXCEPTION 'Draft unavailable' USING ERRCODE='42501'; END IF;
 IF v_uid IS DISTINCT FROM v_owner AND NOT EXISTS (
  SELECT 1 FROM public.elleng_captains c
  WHERE c.draft_id=v_draft AND c.user_id=v_uid AND c.team_index=p_team_index
 ) THEN RAISE EXCEPTION 'Not authorized to score team' USING ERRCODE='42501'; END IF;
 IF coalesce(v_state->>'playFormat','standard') NOT IN ('standard','elleng')
 THEN RAISE EXCEPTION 'Scramble format not selected' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(v_state->'teams') IS DISTINCT FROM 'array'
   OR p_team_index>=jsonb_array_length(v_state->'teams')
 THEN RAISE EXCEPTION 'Team not drafted' USING ERRCODE='22023'; END IF;
 IF p_score IS NULL THEN
  DELETE FROM public.elleng_team_scores
  WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole;
 ELSE
  INSERT INTO public.elleng_team_scores(tournament_id,team_index,hole,score,updated_by,updated_at)
  VALUES(p_tournament_id,p_team_index,p_hole,p_score,v_uid,now())
  ON CONFLICT(tournament_id,team_index,hole)
  DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=now();
 END IF;
 RETURN p_score;
END;
$fn$;
REVOKE ALL ON FUNCTION public.elleng_test_authorized_scramble(text,integer,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_test_authorized_scramble(text,integer,integer,integer) TO authenticated;



-- SOURCE: db/patches/20261029_commissioner_score_reset_rpc_REVIEW_ONLY.sql
-- REVIEW ONLY. Atomic commissioner-only score reset.
-- Install with scored-table privilege lockdown after owner/security review.
CREATE OR REPLACE FUNCTION public.elleng_test_commissioner_clear_scores(p_tournament_id text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
 v_uid uuid := auth.uid();
 v_draft text;
 v_owner uuid;
 v_deleted integer := 0;
 v_rows integer;
BEGIN
 IF v_uid IS NULL OR p_tournament_id IS NULL OR btrim(p_tournament_id)=''
 THEN RAISE EXCEPTION 'Authentication and tournament required' USING ERRCODE='42501'; END IF;
 SELECT t.draft_id INTO v_draft
 FROM public.elleng_tournaments t
 WHERE t.id=p_tournament_id AND t.status IN ('setup','live')
 FOR UPDATE;
 IF v_draft IS NULL THEN RAISE EXCEPTION 'Tournament not available' USING ERRCODE='42501'; END IF;
 SELECT d.owner_id INTO v_owner FROM public.elleng_drafts d WHERE d.id=v_draft FOR SHARE;
 IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_uid
 THEN RAISE EXCEPTION 'Only tournament commissioner can clear scores' USING ERRCODE='42501'; END IF;
 DELETE FROM public.elleng_pair_hole_scores WHERE tournament_id=p_tournament_id;
 GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted:=v_deleted+v_rows;
 DELETE FROM public.elleng_player_hole_scores WHERE tournament_id=p_tournament_id;
 GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted:=v_deleted+v_rows;
 DELETE FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id;
 GET DIAGNOSTICS v_rows = ROW_COUNT; v_deleted:=v_deleted+v_rows;
 RETURN v_deleted;
END $fn$;
REVOKE ALL ON FUNCTION public.elleng_test_commissioner_clear_scores(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.elleng_test_commissioner_clear_scores(text) TO authenticated;



-- SOURCE: tests/acceptance/authorized-shamble-rpc-proposal.sql
-- ISOLATED DESIGN ONLY. Not deployed, not a migration.
-- Caller roster removed. Authorization and roster must come from trusted
-- tournament -> draft state and captain rows.
CREATE OR REPLACE FUNCTION public.elleng_test_authorized_shamble(
 p_tournament_id text, p_team_index integer, p_hole integer,
 p_golfer_index integer, p_score integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
 v_uid uuid := auth.uid();
 v_draft text;
 v_state jsonb;
 v_roster integer[];
 v_low integer;
 v_count integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_tournament_id IS NULL OR p_team_index IS NULL OR p_team_index < 0
  OR p_hole IS NULL OR p_hole NOT BETWEEN 10 AND 18 OR p_golfer_index IS NULL OR p_golfer_index<0
  OR (p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 20)
 THEN RAISE EXCEPTION 'Invalid scoring input' USING ERRCODE='22023'; END IF;
 -- Serialize Shamble requests for this tournament before reading draft state,
 -- status, roster, or authorization. This prevents two scoring callers from
 -- deriving totals from stale player-score snapshots.
 PERFORM pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended('elleng-shamble:' || p_tournament_id, 0)
 );
 SELECT t.draft_id,d.state INTO v_draft,v_state
 FROM public.elleng_tournaments t
 JOIN public.elleng_drafts d ON d.id=t.draft_id
 WHERE t.id=p_tournament_id AND t.status IN ('setup','live')
   AND p_team_index<t.team_count
   AND (d.owner_id=v_uid OR EXISTS(
     SELECT 1 FROM public.elleng_captains c
     WHERE c.draft_id=d.id AND c.team_index=p_team_index AND c.user_id=v_uid
   ))
 FOR SHARE OF t,d;
 IF v_draft IS NULL THEN RAISE EXCEPTION 'Not authorized for this team' USING ERRCODE='42501'; END IF;
 IF coalesce(v_state->>'playFormat','standard') NOT IN ('standard','elleng') THEN RAISE EXCEPTION 'Shamble requires standard scoring format' USING ERRCODE='22023'; END IF;
 -- Authoritative roster from stored draft, not client-supplied data.
 -- Current browser roster entries may be integers or {golferIndex: integer}.
 -- Invalid entries and duplicates fail closed rather than shrinking the team.
 IF jsonb_typeof(v_state->'teams'->p_team_index->'roster') <> 'array'
 THEN RAISE EXCEPTION 'Invalid stored roster' USING ERRCODE='22023'; END IF;
 SELECT array_agg(CASE
   WHEN jsonb_typeof(entry)='number' AND entry::text ~ '^[0-9]+$' THEN (entry::text)::integer
   WHEN jsonb_typeof(entry)='object' AND (entry->>'golferIndex') ~ '^[0-9]+$' THEN (entry->>'golferIndex')::integer
   ELSE NULL END)
 INTO v_roster
 FROM jsonb_array_elements(v_state->'teams'->p_team_index->'roster') entry;
 IF v_roster IS NULL OR cardinality(v_roster)=0
    OR array_position(v_roster,NULL) IS NOT NULL
    OR cardinality(v_roster)<>(SELECT count(DISTINCT golfer) FROM unnest(v_roster) golfer)
    OR p_golfer_index<>ALL(v_roster)
 THEN RAISE EXCEPTION 'Golfer not assigned to team' USING ERRCODE='42501'; END IF;
 IF p_score IS NULL THEN
  DELETE FROM public.elleng_player_hole_scores
  WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole AND golfer_index=p_golfer_index;
 ELSE
  INSERT INTO public.elleng_player_hole_scores(tournament_id,hole,team_index,golfer_index,score,updated_by,updated_at)
  VALUES(p_tournament_id,p_hole,p_team_index,p_golfer_index,p_score,v_uid,now())
  ON CONFLICT(tournament_id,hole,team_index,golfer_index)
  DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 END IF;
 SELECT count(*),min(score) INTO v_count,v_low FROM public.elleng_player_hole_scores
 WHERE tournament_id=p_tournament_id AND team_index=p_team_index AND hole=p_hole
   AND golfer_index=ANY(v_roster);
 IF v_count<>cardinality(v_roster) THEN
  DELETE FROM public.elleng_team_scores WHERE tournament_id=p_tournament_id
    AND team_index=p_team_index AND hole=p_hole;
  RETURN NULL;
 END IF;
 INSERT INTO public.elleng_team_scores(tournament_id,team_index,hole,score,updated_by,updated_at)
 VALUES(p_tournament_id,p_team_index,p_hole,v_low,v_uid,now())
 ON CONFLICT(tournament_id,team_index,hole)
 DO UPDATE SET score=excluded.score,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
 RETURN v_low;
END $fn$;
REVOKE ALL ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) TO authenticated;
-- Definer owner and runtime grants must be audited before production installation.




CREATE TRIGGER elleng_lock_team_parent BEFORE INSERT OR UPDATE ON public.elleng_team_scores FOR EACH ROW EXECUTE FUNCTION public.elleng_lock_parent_for_score_write();

CREATE TRIGGER elleng_lock_pair_parent BEFORE INSERT OR UPDATE ON public.elleng_pair_hole_scores FOR EACH ROW EXECUTE FUNCTION public.elleng_lock_parent_for_score_write();

CREATE TRIGGER elleng_lock_player_parent BEFORE INSERT OR UPDATE ON public.elleng_player_hole_scores FOR EACH ROW EXECUTE FUNCTION public.elleng_lock_parent_for_score_write();

CREATE TRIGGER elleng_enforce_team_score_format BEFORE INSERT OR UPDATE ON public.elleng_team_scores FOR EACH ROW EXECUTE FUNCTION public.elleng_enforce_team_score_format();

CREATE TRIGGER elleng_prevent_scored_draft_format_change BEFORE UPDATE OF state ON public.elleng_drafts FOR EACH ROW EXECUTE FUNCTION public.elleng_prevent_scored_draft_format_change();

CREATE TRIGGER elleng_guard_scored_tournament_config BEFORE UPDATE OF team_count ON public.elleng_tournaments FOR EACH ROW EXECUTE FUNCTION public.elleng_guard_scored_tournament_config();

ALTER TABLE public.elleng_team_scores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.elleng_pair_hole_scores ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.elleng_player_hole_scores ENABLE ROW LEVEL SECURITY;

-- REVIEW ONLY: coordinated RPC-only migration, never standalone.
-- Old permissive active-event policies must not remain available as an
-- unintended authorization path if table grants change later.
-- The four authorized SECURITY DEFINER RPCs enforce their own team access.
DROP POLICY IF EXISTS "active live team delete guard" ON public.elleng_team_scores;
DROP POLICY IF EXISTS "active live team insert guard" ON public.elleng_team_scores;
DROP POLICY IF EXISTS "active live team update guard" ON public.elleng_team_scores;
DROP POLICY IF EXISTS "active live pair scores delete guard" ON public.elleng_pair_hole_scores;
DROP POLICY IF EXISTS "active live pair scores insert guard" ON public.elleng_pair_hole_scores;
DROP POLICY IF EXISTS "active live pair scores update guard" ON public.elleng_pair_hole_scores;
DROP POLICY IF EXISTS "active live player scores delete guard" ON public.elleng_player_hole_scores;
DROP POLICY IF EXISTS "active live player scores insert guard" ON public.elleng_player_hole_scores;
DROP POLICY IF EXISTS "active live player scores update guard" ON public.elleng_player_hole_scores;
DO $policy_gate$
BEGIN
 IF EXISTS (
  SELECT 1 FROM pg_policies
  WHERE schemaname='public'
   AND tablename IN ('elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores')
   AND policyname LIKE 'active live % guard'
 ) THEN RAISE EXCEPTION 'NO-GO: legacy broad score write policy still present'; END IF;
END $policy_gate$;



-- REVIEW ONLY. Install only with all three authenticated RPCs and verified
-- SECURITY DEFINER ownership; never apply this patch on its own.
-- No direct score-table writes are permitted from anon or authenticated.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
 ON TABLE public.elleng_team_scores,
          public.elleng_pair_hole_scores,
          public.elleng_player_hole_scores
 FROM PUBLIC, anon, authenticated;

DO $verify_dml_lockdown$
DECLARE bad_count integer;
BEGIN
 SELECT count(*) INTO bad_count
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
 AND c.relname IN ('elleng_team_scores','elleng_pair_hole_scores','elleng_player_hole_scores')
 AND (
  has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE')
  OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
 );
 IF bad_count <> 0 THEN
  RAISE EXCEPTION 'NO-GO: score-table DML still available to API roles on % tables',bad_count;
 END IF;
END $verify_dml_lockdown$;



-- REVIEW ONLY. Audit privileged RPC owners and role exposure after installing
-- the coordinated migration inside disposable PostgreSQL. Fail closed.
DO $rpc_owners$
DECLARE bad text;
BEGIN
 SELECT string_agg(p.proname||' owner='||r.rolname||' definer='||p.prosecdef||' config='||coalesce(array_to_string(p.proconfig,','),'null')||' anon_exec='||has_function_privilege('anon',p.oid,'EXECUTE')||' auth_exec='||has_function_privilege('authenticated',p.oid,'EXECUTE'), ', ')
 INTO bad
 FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_roles r ON r.oid=p.proowner
 WHERE n.nspname='public'
 AND p.proname IN (
  'elleng_test_authorized_scramble','elleng_test_authorized_shamble',
  'elleng_test_authorized_split_pair','elleng_test_commissioner_clear_scores'
 )
 AND (
  NOT p.prosecdef OR p.proconfig IS NULL
  OR NOT (p.proconfig && ARRAY['search_path=','search_path=""']::text[])
  OR r.rolname IN ('anon','authenticated')
  OR has_function_privilege('anon',p.oid,'EXECUTE')
  OR NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
 );
 IF bad IS NOT NULL THEN
  RAISE EXCEPTION 'NO-GO: privileged scoring RPC owner/search_path/ACL mismatch: %',bad;
 END IF;
 IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN (
   'elleng_test_authorized_scramble','elleng_test_authorized_shamble',
   'elleng_test_authorized_split_pair','elleng_test_commissioner_clear_scores')) <> 4
 THEN RAISE EXCEPTION 'NO-GO: four privileged scoring RPCs are required'; END IF;
END $rpc_owners$;



REVOKE ALL ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.elleng_test_authorized_shamble(text,integer,integer,integer,integer) TO authenticated;

DO $block$ BEGIN RAISE EXCEPTION 'REVIEW-ONLY scoring candidate: direct-DML permissions and trigger owner must be reconciled before deployment'; END $block$;

COMMIT;
