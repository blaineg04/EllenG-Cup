-- REVIEW ONLY: execute exclusively against an isolated restored EllenG Cup test DB.
-- INSECURE TEST-ONLY prototype: p_roster is caller-supplied and no auth check is enforced.\n-- Atomic Shamble write prototype. Never apply to production without RLS remediation,
-- authenticated security checks, release approval, backup and rollback evidence.
-- The locked tournament row serializes participating writes for that tournament.
-- All participating Shamble writers MUST use this function, otherwise stale browser
-- updates can still overwrite the derived score.
BEGIN;
CREATE OR REPLACE FUNCTION public.elleng_test_save_shamble_score(
 p_tournament_id text, p_team_index integer, p_hole integer,
 p_golfer_index integer, p_score integer, p_roster integer[]
) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE v_low integer; v_count integer; v_unique_count integer;
BEGIN
 IF p_tournament_id IS NULL OR p_team_index IS NULL OR p_team_index < 0
    OR p_hole NOT BETWEEN 10 AND 18 OR p_golfer_index IS NULL OR p_golfer_index < 0
    OR p_score IS NOT NULL AND p_score NOT BETWEEN 1 AND 20
 THEN RAISE EXCEPTION 'Invalid Shamble score request' USING ERRCODE='22023'; END IF;
 SELECT count(*),count(DISTINCT golfer) INTO v_count,v_unique_count
 FROM unnest(p_roster) AS golfer;
 IF p_roster IS NULL OR array_position(p_roster,NULL) IS NOT NULL OR v_count=0 OR v_count<>v_unique_count OR p_golfer_index<>ALL(p_roster)
 THEN RAISE EXCEPTION 'Invalid roster or golfer' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.elleng_tournaments t
                WHERE t.id=p_tournament_id AND t.status IN ('setup','live')
                  AND p_team_index<t.team_count)
 THEN RAISE EXCEPTION 'Tournament not active or team outside range' USING ERRCODE='22023'; END IF;
 -- Locking the canonical tournament row makes participating same-tournament
 -- operations serial, even when the team-score row does not yet exist.
 PERFORM 1 FROM public.elleng_tournaments t WHERE t.id=p_tournament_id FOR UPDATE;
 IF p_score IS NULL THEN
   DELETE FROM public.elleng_player_hole_scores s
    WHERE s.tournament_id=p_tournament_id AND s.team_index=p_team_index
      AND s.hole=p_hole AND s.golfer_index=p_golfer_index;
 ELSE
   INSERT INTO public.elleng_player_hole_scores
    (tournament_id,hole,team_index,golfer_index,score,updated_at)
   VALUES(p_tournament_id,p_hole,p_team_index,p_golfer_index,p_score,now())
   ON CONFLICT(tournament_id,hole,team_index,golfer_index)
   DO UPDATE SET score=excluded.score,updated_at=excluded.updated_at;
 END IF;
 SELECT count(*),min(s.score) INTO v_count,v_low
 FROM public.elleng_player_hole_scores s
 WHERE s.tournament_id=p_tournament_id AND s.team_index=p_team_index
   AND s.hole=p_hole AND s.golfer_index=ANY(p_roster);
 IF v_count<>v_unique_count THEN
   DELETE FROM public.elleng_team_scores s WHERE s.tournament_id=p_tournament_id
      AND s.team_index=p_team_index AND s.hole=p_hole;
   RETURN NULL;
 END IF;
 INSERT INTO public.elleng_team_scores
    (tournament_id,team_index,hole,score,updated_at)
 VALUES (p_tournament_id,p_team_index,p_hole,v_low,now())
 ON CONFLICT(tournament_id,team_index,hole)
 DO UPDATE SET score=excluded.score,updated_at=excluded.updated_at;
 RETURN v_low;
END $fn$;
-- TEST-ONLY: do not grant EXECUTE to browser roles or install on production.
REVOKE ALL ON FUNCTION public.elleng_test_save_shamble_score(text,integer,integer,integer,integer,integer[]) FROM PUBLIC;
ROLLBACK;
