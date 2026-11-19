-- Disposable PostgreSQL integration fixture. Never install in production.
-- Models a single noncaptain move using existing guard_delta trigger.
BEGIN;
CREATE OR REPLACE FUNCTION transfer_fixture.move_golfer(
 p_actor text, p_tournament text, p_draft text, p_revision timestamptz,
 p_golfer integer, p_destination integer
) RETURNS void LANGUAGE plpgsql SET search_path=pg_catalog AS $fn$
DECLARE s jsonb; old_team integer; old_roster jsonb; new_roster jsonb; destination_roster jsonb; destination_member jsonb;
        member jsonb; idx integer; seen integer:=0;
BEGIN
 PERFORM transfer_fixture.check_transfer_gate(p_actor,p_tournament,p_draft,p_revision);
 SELECT state INTO s FROM transfer_fixture.drafts WHERE id=p_draft;
 IF p_golfer IS NULL OR p_golfer < 0 OR p_golfer >= jsonb_array_length(s->'golfers')
 THEN RAISE EXCEPTION 'invalid golfer'; END IF;
 IF p_destination IS NULL OR p_destination NOT IN (0,1) OR s#>>ARRAY['golfers',p_golfer::text,'team'] NOT IN ('0','1')
 THEN RAISE EXCEPTION 'invalid destination or team'; END IF;
 old_team := (s#>>ARRAY['golfers',p_golfer::text,'team'])::integer;
 IF old_team=p_destination THEN RAISE EXCEPTION 'same team'; END IF;
 old_roster := s#>ARRAY['teams',old_team::text,'roster'];
 new_roster := '[]'::jsonb;
 FOR member IN SELECT value FROM jsonb_array_elements(old_roster) LOOP
   IF jsonb_typeof(member)='object' THEN idx:=(member->>'golferIndex')::integer;
   ELSE idx:=(member::text)::integer; END IF;
   IF idx=p_golfer THEN seen:=seen+1;
   ELSE new_roster:=new_roster||jsonb_build_array(member); END IF;
 END LOOP;
 IF seen<>1 THEN RAISE EXCEPTION 'source membership invalid'; END IF;
 s:=jsonb_set(s,ARRAY['teams',old_team::text,'roster'],new_roster);
 destination_roster:=s#>ARRAY['teams',p_destination::text,'roster'];
 -- Preserve object-style roster entries where the destination uses objects.
 destination_member:=to_jsonb(p_golfer);
 IF jsonb_array_length(destination_roster)>0 AND jsonb_typeof(destination_roster->0)='object'
 THEN destination_member:=jsonb_build_object('golferIndex',p_golfer); END IF;
 s:=jsonb_set(s,ARRAY['teams',p_destination::text,'roster'],
   destination_roster||jsonb_build_array(destination_member));
 s:=jsonb_set(s,ARRAY['golfers',p_golfer::text,'team'],to_jsonb(p_destination));
 UPDATE transfer_fixture.drafts SET state=s,updated_at=clock_timestamp() WHERE id=p_draft;
 -- The trigger enforces no captain changes, no unrelated metadata edits,
 -- and full roster consistency before the update can commit.
END $fn$;
COMMIT;
