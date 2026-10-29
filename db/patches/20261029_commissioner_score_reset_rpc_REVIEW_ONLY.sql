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
