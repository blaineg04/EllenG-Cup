-- Disposable PostgreSQL contract test. This is a small isolated model of the
-- commissioner version-check path, NOT a deployment of the actual Supabase RPC.
-- No production credentials or tournament records are involved.
CREATE SCHEMA acceptance;
CREATE TABLE acceptance.drafts (
  id text PRIMARY KEY,
  owner_id uuid NOT NULL,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE FUNCTION acceptance.save_state_if_fresh(
  p_draft_id text, p_expected_updated_at timestamptz, p_state jsonb
) RETURNS TABLE(state jsonb, updated_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_uid uuid := nullif(current_setting('acceptance.actor',true),'')::uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM acceptance.drafts d WHERE d.id=p_draft_id AND d.owner_id=v_uid)
  THEN RAISE EXCEPTION 'Commissioner access required'; END IF;
  RETURN QUERY
  UPDATE acceptance.drafts d SET state=p_state, updated_at=now()
  WHERE d.id=p_draft_id AND d.owner_id=v_uid AND d.updated_at=p_expected_updated_at
  RETURNING d.state,d.updated_at;
  IF NOT FOUND THEN RAISE EXCEPTION 'Stale version' USING ERRCODE='40001'; END IF;
END $$;
INSERT INTO acceptance.drafts
VALUES ('disposable-only','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"picks":[]}'::jsonb, '2026-10-22 00:00:00+00');

DO $$
DECLARE first_version timestamptz := '2026-10-22 00:00:00+00';
DECLARE updated_version timestamptz;
DECLARE count_rows integer;
BEGIN
  PERFORM set_config('acceptance.actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
  SELECT s.updated_at INTO updated_version
  FROM acceptance.save_state_if_fresh('disposable-only',first_version,'{"picks":[1]}'::jsonb) s;
  IF updated_version IS NULL OR updated_version=first_version THEN RAISE EXCEPTION 'Valid commissioner save not confirmed'; END IF;
  BEGIN
    PERFORM acceptance.save_state_if_fresh('disposable-only',first_version,'{"picks":[2]}'::jsonb);
    RAISE EXCEPTION 'Stale save was wrongly accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT state FROM acceptance.drafts WHERE id='disposable-only') <> '{"picks":[1]}'::jsonb
  THEN RAISE EXCEPTION 'Stale save overwrote accepted data'; END IF;
  PERFORM set_config('acceptance.actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
  BEGIN
    PERFORM acceptance.save_state_if_fresh('disposable-only',updated_version,'{"picks":[3]}'::jsonb);
    RAISE EXCEPTION 'Non-owner save was wrongly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Non-owner save was wrongly accepted' THEN RAISE; END IF;
  END;
  IF (SELECT state FROM acceptance.drafts WHERE id='disposable-only') <> '{"picks":[1]}'::jsonb
  THEN RAISE EXCEPTION 'Non-owner altered saved state'; END IF;
  RAISE NOTICE 'PASS: confirmed readback, stale conflict rejection, unauthorized caller rejection';
END $$;

-- Reject unsigned requests and preserve the last accepted version.
DO $$
DECLARE saved jsonb; old_version timestamptz;
BEGIN
  SELECT state,updated_at INTO saved,old_version FROM acceptance.drafts WHERE id='disposable-only';
  PERFORM set_config('acceptance.actor','',true);
  BEGIN
    PERFORM acceptance.save_state_if_fresh('disposable-only',old_version,'{"picks":[100]}'::jsonb);
    RAISE EXCEPTION 'Missing-session save incorrectly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Missing-session save incorrectly succeeded' THEN RAISE; END IF;
    IF SQLERRM<>'Sign in required' THEN RAISE; END IF;
  END;
  IF (SELECT state FROM acceptance.drafts WHERE id='disposable-only') IS DISTINCT FROM saved
  THEN RAISE EXCEPTION 'Unsigned save changed accepted draft data'; END IF;
  RAISE NOTICE 'PASS: missing session rejected and original state preserved';
END $$;

-- An authorized commissioner must not be able to mutate a different draft.
INSERT INTO acceptance.drafts VALUES ('other-disposable','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','{"picks":[]}'::jsonb,'2026-10-22 00:00:00+00');
DO $$
DECLARE before_state jsonb;
BEGIN
  SELECT state INTO before_state FROM acceptance.drafts WHERE id='other-disposable';
  PERFORM set_config('acceptance.actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
  BEGIN
    PERFORM acceptance.save_state_if_fresh('other-disposable','2026-10-22 00:00:00+00','{"picks":[99]}'::jsonb);
    RAISE EXCEPTION 'Cross-draft save incorrectly succeeded';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM='Cross-draft save incorrectly succeeded' THEN RAISE; END IF;
    IF SQLERRM<>'Commissioner access required' THEN RAISE; END IF;
  END;
  IF (SELECT state FROM acceptance.drafts WHERE id='other-disposable') IS DISTINCT FROM before_state
  THEN RAISE EXCEPTION 'Cross-draft state was altered'; END IF;
  RAISE NOTICE 'PASS: cross-draft owner isolation';
END $$;
