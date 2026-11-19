-- STAGED ONLY: serialize tee group assignment writes with commissioner roster changes.
-- The commissioner RPC locks the tournament row first, then the draft.
-- This trigger takes the same tournament lock before INSERT/UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.elleng_lock_tournament_for_group_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_draft_id text; v_tournament_id text;
BEGIN
 v_draft_id := CASE WHEN TG_OP='DELETE' THEN OLD.draft_id ELSE NEW.draft_id END;
 IF TG_OP='UPDATE' AND NEW.draft_id IS DISTINCT FROM OLD.draft_id THEN
  RAISE EXCEPTION 'Changing group assignment draft is not supported';
 END IF;
 IF v_draft_id='elleng-cup' THEN
  SELECT id INTO v_tournament_id FROM public.elleng_tournaments
   WHERE id='elleng-cup-live' AND draft_id=v_draft_id FOR UPDATE;
  IF v_tournament_id IS NULL THEN
   RAISE EXCEPTION 'Tournament missing for group assignment';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS elleng_lock_group_assignment_parent ON public.elleng_group_assignments;
CREATE TRIGGER elleng_lock_group_assignment_parent
 BEFORE INSERT OR UPDATE OR DELETE ON public.elleng_group_assignments
 FOR EACH ROW EXECUTE FUNCTION public.elleng_lock_tournament_for_group_assignment();
REVOKE ALL ON FUNCTION public.elleng_lock_tournament_for_group_assignment() FROM PUBLIC,anon,authenticated;
