-- The function below is the actual read-only-extracted live EllenG commissioner RPC
-- as of 2026-10-22. Only auth.uid() is replaced with a disposable local shim.
-- No live database calls or identities are used at runtime.
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
SELECT nullif(current_setting('elleng.test_actor',true),'')::uuid
$$;
CREATE TABLE public.elleng_drafts (
 id text PRIMARY KEY,owner_id uuid NOT NULL,state jsonb NOT NULL,updated_at timestamptz NOT NULL
);
CREATE OR REPLACE FUNCTION public.elleng_save_state_if_fresh(p_draft_id text, p_expected_updated_at timestamp with time zone, p_state jsonb)
 RETURNS TABLE(state jsonb, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sign in required'; end if;
  if not exists(select 1 from public.elleng_drafts d where d.id=p_draft_id and d.owner_id=v_uid) then raise exception 'Commissioner access required'; end if;
  return query
  update public.elleng_drafts d
  set state = p_state, updated_at = now()
  where d.id = p_draft_id and d.owner_id = v_uid and d.updated_at = p_expected_updated_at
  returning d.state, d.updated_at;
  if not found then raise exception 'This tournament changed on another device. Reload before saving again.' using errcode='40001'; end if;
end;
$function$

INSERT INTO public.elleng_drafts VALUES
('qa-draft','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','{"picks":[]}'::jsonb,'2026-10-22T00:00:00Z');
DO $qa$
DECLARE initial timestamptz:='2026-10-22T00:00:00Z'; saved jsonb; newer timestamptz;
BEGIN
 PERFORM set_config('elleng.test_actor','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',true);
 SELECT s.state,s.updated_at INTO saved,newer FROM public.elleng_save_state_if_fresh('qa-draft',initial,'{"picks":[1]}'::jsonb) s;
 IF saved IS DISTINCT FROM '{"picks":[1]}'::jsonb OR newer=initial THEN RAISE EXCEPTION 'Commissioner save failed'; END IF;
 BEGIN
   PERFORM public.elleng_save_state_if_fresh('qa-draft',initial,'{"picks":[2]}'::jsonb);
   RAISE EXCEPTION 'Expected stale write rejection';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF (SELECT state FROM public.elleng_drafts WHERE id='qa-draft') <> '{"picks":[1]}'::jsonb THEN RAISE EXCEPTION 'Stale write damaged state'; END IF;
 PERFORM set_config('elleng.test_actor','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',true);
 BEGIN
   PERFORM public.elleng_save_state_if_fresh('qa-draft',newer,'{"picks":[3]}'::jsonb);
   RAISE EXCEPTION 'Unauthorized write succeeded';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'Commissioner access required' THEN RAISE; END IF;
 END;
 PERFORM set_config('elleng.test_actor','',true);
 BEGIN
   PERFORM public.elleng_save_state_if_fresh('qa-draft',newer,'{"picks":[4]}'::jsonb);
   RAISE EXCEPTION 'Anonymous write succeeded';
 EXCEPTION WHEN raise_exception THEN
   IF SQLERRM <> 'Sign in required' THEN RAISE; END IF;
 END;
 IF (SELECT state FROM public.elleng_drafts WHERE id='qa-draft') <> '{"picks":[1]}'::jsonb THEN RAISE EXCEPTION 'Unauthorized write damaged state'; END IF;
 RAISE NOTICE 'PASS: extracted actual commissioner save RPC rejects stale, unauthorized and anonymous writes';
END $qa$;
