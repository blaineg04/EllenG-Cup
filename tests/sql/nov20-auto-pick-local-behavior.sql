BEGIN;
DO $$
DECLARE before_state jsonb; after_state jsonb; again jsonb;
BEGIN
 SELECT state INTO before_state FROM public.elleng_drafts WHERE id='test-draft';
 IF jsonb_array_length(before_state->'picks')<>3 THEN RAISE EXCEPTION 'Invalid draft fixture'; END IF;
 SELECT public.elleng_auto_pick('test-draft') INTO after_state;
 IF jsonb_array_length(after_state->'picks')<>4 THEN RAISE EXCEPTION 'Auto-pick did not advance exactly once'; END IF;
 IF (after_state->'golfers'->1->>'team')::integer<>0 THEN RAISE EXCEPTION 'Last remaining golfer not assigned to expected team'; END IF;
 IF (after_state->'picks'->3->>'auto')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Auto-pick marker missing'; END IF;
 SELECT public.elleng_auto_pick('test-draft') INTO again;
 IF jsonb_array_length(again->'picks')<>4 THEN RAISE EXCEPTION 'Duplicate auto-pick occurred'; END IF;
END $$;
ROLLBACK;
