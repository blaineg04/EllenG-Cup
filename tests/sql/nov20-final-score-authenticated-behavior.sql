-- Requires disposable fixture + migration. Checks actual authenticated RLS behavior.
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
DECLARE t text;
DECLARE n int;
BEGIN
 FOR t IN SELECT unnest(ARRAY['elleng_team_scores','elleng_player_hole_scores','elleng_pair_hole_scores'])
 LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',t) INTO n;
  IF n <> 1 THEN RAISE EXCEPTION 'finalized % rows invisible, count=%',t,n; END IF;
  EXECUTE format('UPDATE public.%I SET team_index=1 WHERE team_index=0',t);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'finalized % update was allowed',t; END IF;
  EXECUTE format('DELETE FROM public.%I WHERE team_index=0',t);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'finalized % delete was allowed',t; END IF;
  BEGIN
   EXECUTE format('INSERT INTO public.%I (tournament_id,team_index) VALUES (%L,0)',t,
     '00000000-0000-0000-0000-000000000091');
   RAISE EXCEPTION 'finalized % INSERT was allowed',t;
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
   NULL;
  END;
 END LOOP;
END $$;
ROLLBACK;
