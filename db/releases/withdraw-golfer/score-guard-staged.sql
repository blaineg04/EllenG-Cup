-- STAGED ONLY: defense in depth for stale clients and direct table writes.
-- This trigger rejects player-hole score inserts/updates for withdrawn or inactive golfers.
-- It does not alter score calculation or delete behavior.
CREATE OR REPLACE FUNCTION public.elleng_reject_inactive_player_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_state jsonb; v_golfer jsonb;
BEGIN
 IF NEW.tournament_id IS DISTINCT FROM 'elleng-cup-live' THEN RETURN NEW; END IF;
 SELECT d.state INTO v_state FROM public.elleng_tournaments t
 JOIN public.elleng_drafts d ON d.id=t.draft_id
 WHERE t.id=NEW.tournament_id;
 IF v_state IS NULL OR jsonb_typeof(v_state->'golfers')<>'array'
 OR NEW.golfer_index IS NULL OR NEW.golfer_index<0
 OR NEW.golfer_index>=jsonb_array_length(v_state->'golfers')
 THEN RAISE EXCEPTION 'Invalid golfer for score' USING ERRCODE='22023'; END IF;
 v_golfer:=v_state#>ARRAY['golfers',NEW.golfer_index::text];
 IF v_golfer->>'participating'='false' OR v_golfer->>'withdrawn'='true'
 THEN RAISE EXCEPTION 'Withdrawn golfer cannot be scored' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS elleng_reject_inactive_player_score_trg ON public.elleng_player_hole_scores;
CREATE TRIGGER elleng_reject_inactive_player_score_trg
BEFORE INSERT OR UPDATE ON public.elleng_player_hole_scores
FOR EACH ROW EXECUTE FUNCTION public.elleng_reject_inactive_player_score();
REVOKE ALL ON FUNCTION public.elleng_reject_inactive_player_score() FROM PUBLIC,anon,authenticated;
