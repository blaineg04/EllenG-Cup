-- Disposable PostgreSQL integration fixture only. No production schema or grants.
-- This function models locked-row authorization and score gates; it never edits rosters.
BEGIN;
CREATE TABLE transfer_fixture.tournaments (
 id text PRIMARY KEY, draft_id text NOT NULL, status text NOT NULL
);
CREATE TABLE transfer_fixture.score_presence (
 tournament_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('player','team','pair'))
);
ALTER TABLE transfer_fixture.drafts ADD COLUMN owner_id text DEFAULT 'owner';
ALTER TABLE transfer_fixture.drafts ADD COLUMN status text DEFAULT 'completed';
CREATE OR REPLACE FUNCTION transfer_fixture.check_transfer_gate(
 p_actor text, p_tournament text, p_draft text, p_expected_updated_at timestamptz
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE t transfer_fixture.tournaments%ROWTYPE;
        d transfer_fixture.drafts%ROWTYPE;
BEGIN
 -- Mirrors the scoring namespace; serialize with score writers using same lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('elleng-shamble:' || p_tournament,0));
 SELECT * INTO t FROM transfer_fixture.tournaments WHERE id=p_tournament FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'missing tournament'; END IF;
 SELECT * INTO d FROM transfer_fixture.drafts WHERE id=p_draft FOR UPDATE;
 IF NOT FOUND OR t.draft_id IS DISTINCT FROM d.id THEN RAISE EXCEPTION 'draft mismatch'; END IF;
 IF p_actor IS NULL OR d.owner_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'not commissioner'; END IF;
 IF t.status <> 'setup' THEN RAISE EXCEPTION 'not setup'; END IF;
 IF d.status <> 'completed' THEN RAISE EXCEPTION 'draft incomplete'; END IF;
 IF d.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'stale revision'; END IF;
 IF EXISTS (SELECT 1 FROM transfer_fixture.score_presence WHERE tournament_id=p_tournament)
 THEN RAISE EXCEPTION 'scores exist'; END IF;
END $fn$;
COMMIT;
