-- Disposable two-golfer swap RPC; NOT a production migration.
BEGIN;
CREATE OR REPLACE FUNCTION transfer_fixture.swap_golfers(
 p_actor text,p_tournament text,p_draft text,p_revision timestamptz,
 p_first integer,p_second integer
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE s jsonb; a integer; b integer; t integer; member jsonb;
        original jsonb; replacement jsonb; idx integer; removed integer;
BEGIN
 PERFORM transfer_fixture.check_transfer_gate(p_actor,p_tournament,p_draft,p_revision);
 SELECT state INTO s FROM transfer_fixture.drafts WHERE id=p_draft;
 IF p_first IS NULL OR p_second IS NULL OR p_first=p_second
    OR p_first<0 OR p_second<0
    OR p_first>=jsonb_array_length(s->'golfers')
    OR p_second>=jsonb_array_length(s->'golfers')
 THEN RAISE EXCEPTION 'invalid swap golfers'; END IF;
 a:=(s#>>ARRAY['golfers',p_first::text,'team'])::integer;
 b:=(s#>>ARRAY['golfers',p_second::text,'team'])::integer;
 IF a NOT IN (0,1) OR b NOT IN (0,1) OR a=b
 THEN RAISE EXCEPTION 'swap requires opposing teams'; END IF;
 FOR t IN 0..1 LOOP
  original:=s#>ARRAY['teams',t::text,'roster'];
  replacement:='[]'::jsonb; removed:=0;
  FOR member IN SELECT value FROM jsonb_array_elements(original) LOOP
   IF jsonb_typeof(member)='object' THEN idx:=(member->>'golferIndex')::integer;
   ELSE idx:=(member::text)::integer; END IF;
   IF (t=a AND idx=p_first) OR (t=b AND idx=p_second)
   THEN
    removed:=removed+1;
    IF jsonb_typeof(member)='object'
    THEN member:=jsonb_set(member,'{golferIndex}',to_jsonb(CASE WHEN t=a THEN p_second ELSE p_first END));
    ELSE member:=to_jsonb(CASE WHEN t=a THEN p_second ELSE p_first END); END IF;
   END IF;
   replacement:=replacement||jsonb_build_array(member);
  END LOOP;
  IF removed<>1 THEN RAISE EXCEPTION 'invalid source membership'; END IF;
  s:=jsonb_set(s,ARRAY['teams',t::text,'roster'],replacement);
 END LOOP;
 s:=jsonb_set(s,ARRAY['golfers',p_first::text,'team'],to_jsonb(b));
 s:=jsonb_set(s,ARRAY['golfers',p_second::text,'team'],to_jsonb(a));
 UPDATE transfer_fixture.drafts SET state=s,updated_at=clock_timestamp() WHERE id=p_draft;
 -- Existing isolated guard_delta trigger checks captain and roster invariants.
END $fn$;
COMMIT;
