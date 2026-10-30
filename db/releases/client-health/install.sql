BEGIN;
CREATE TABLE public.elleng_client_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor_id uuid NOT NULL,event_code text NOT NULL CHECK(event_code IN ('script_error','unhandled_rejection','score_save_failed','score_refresh_failed','rsvp_load_failed','draft_sync_failed')),
 route text NOT NULL CHECK(route IN ('scoring','draft','captain','admin')),
 client_build text NOT NULL CHECK(client_build ~ '^[A-Za-z0-9._-]{1,32}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX elleng_client_events_actor_created ON public.elleng_client_events(actor_id,created_at DESC);
ALTER TABLE public.elleng_client_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.elleng_client_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE public.elleng_client_events_id_seq FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.elleng_client_events TO authenticated;
CREATE POLICY commissioner_read_client_events ON public.elleng_client_events FOR SELECT TO authenticated
 USING(EXISTS(SELECT 1 FROM public.elleng_drafts d WHERE d.id='elleng-cup' AND d.owner_id=(SELECT auth.uid())));
CREATE FUNCTION public.elleng_report_client_event(p_code text,p_route text,p_build text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_uid uuid:=auth.uid();v_count integer;
BEGIN
 IF v_uid IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 IF p_code IS NULL OR p_code NOT IN ('script_error','unhandled_rejection','score_save_failed','score_refresh_failed','rsvp_load_failed','draft_sync_failed')
 OR p_route IS NULL OR p_route NOT IN ('scoring','draft','captain','admin')
 OR p_build IS NULL OR p_build !~ '^[A-Za-z0-9._-]{1,32}$'
 THEN RAISE EXCEPTION 'Invalid diagnostic code' USING ERRCODE='22023'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('elleng-health:'||v_uid::text,0));
 SELECT count(*) INTO v_count FROM public.elleng_client_events WHERE actor_id=v_uid AND created_at>clock_timestamp()-interval '10 minutes';
 IF v_count>=20 THEN RETURN false; END IF;
 INSERT INTO public.elleng_client_events(actor_id,event_code,route,client_build) VALUES(v_uid,p_code,p_route,p_build);
 DELETE FROM public.elleng_client_events WHERE actor_id=v_uid AND id NOT IN
  (SELECT id FROM public.elleng_client_events WHERE actor_id=v_uid ORDER BY created_at DESC,id DESC LIMIT 100);
 RETURN true;
END $fn$;
ALTER FUNCTION public.elleng_report_client_event(text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.elleng_report_client_event(text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.elleng_report_client_event(text,text,text) TO authenticated;
COMMIT;
