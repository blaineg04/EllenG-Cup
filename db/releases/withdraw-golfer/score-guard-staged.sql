-- STAGED ONLY: defense in depth for stale clients and direct table writes.
-- This trigger rejects player-hole score inserts, updates, and deletes for withdrawn or inactive golfers.
-- Does not alter score calculations; only rejects score mutations for withdrawn golfers.
CREATE OR REPLACE FUNCTION public.elleng_reject_inactive_player_score()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_state jsonb; v_golfer jsonb; v_row public.elleng_player_hole_scores%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN v_row:=OLD; ELSE v_row:=NEW; END IF;
 IF v_row.tournament_id IS DISTINCT FROM 'elleng-cup-live' THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END IF;
 -- Lock the draft row to serialize with commissioner withdrawal/restore updates.
 -- A score arriving first forces the commissioner RPC to observe it and reject withdrawal.
 -- A withdrawal arriving first forces this score write to see inactive status.
 SELECT d.state INTO v_state FROM public.elleng_tournaments t
 JOIN public.elleng_drafts d ON d.id=t.draft_id
 WHERE t.id=v_row.tournament_id FOR SHARE OF d;
 IF v_state IS NULL OR jsonb_typeof(v_state->'golfers')<>'array'
 OR v_row.golfer_index IS NULL OR v_row.golfer_index<0
 OR v_row.golfer_index>=jsonb_array_length(v_state->'golfers')
 THEN RAISE EXCEPTION 'Invalid golfer for score' USING ERRCODE='22023'; END IF;
 v_golfer:=v_state#>ARRAY['golfers',v_row.golfer_index::text];
 IF v_golfer->>'participating'='false' OR v_golfer->>'withdrawn'='true'
 THEN RAISE EXCEPTION 'Withdrawn golfer cannot be scored' USING ERRCODE='42501'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS elleng_reject_inactive_player_score_trg ON public.elleng_player_hole_scores;
CREATE TRIGGER elleng_reject_inactive_player_score_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.elleng_player_hole_scores
FOR EACH ROW EXECUTE FUNCTION public.elleng_reject_inactive_player_score();
REVOKE ALL ON FUNCTION public.elleng_reject_inactive_player_score() FROM PUBLIC,anon,authenticated;
