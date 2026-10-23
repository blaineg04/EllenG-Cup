-- Disposable concurrency model; NOT the deployed Supabase draft RPC.
-- Independent sessions race for one golfer; row locking must serialize them.
CREATE TABLE acceptance.picks (
  draft_id text NOT NULL,
  golfer integer NOT NULL,
  team integer NOT NULL,
  PRIMARY KEY (draft_id,golfer)
);
CREATE TABLE acceptance.turns (draft_id text PRIMARY KEY, current_team integer NOT NULL);
INSERT INTO acceptance.turns VALUES ('disposable-only',0);
CREATE FUNCTION acceptance.try_pick(p_draft text,p_golfer int,p_team int,p_delay numeric DEFAULT 0)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE turn_team int;
BEGIN
  SELECT current_team INTO turn_team FROM acceptance.turns WHERE draft_id=p_draft FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing draft'; END IF;
  IF p_team<>turn_team THEN RETURN 'wrong_turn'; END IF;
  IF EXISTS(SELECT 1 FROM acceptance.picks WHERE draft_id=p_draft AND golfer=p_golfer) THEN RETURN 'already_picked'; END IF;
  IF p_delay>0 THEN PERFORM pg_sleep(p_delay); END IF;
  INSERT INTO acceptance.picks VALUES(p_draft,p_golfer,p_team);
  UPDATE acceptance.turns SET current_team=1-current_team WHERE draft_id=p_draft;
  RETURN 'accepted';
END $$;
