-- Verify snake/standard turn ordering for variable team counts.
-- Isolated algorithm contract only; not a live Supabase RPC invocation.
CREATE FUNCTION acceptance.team_on_clock(p_pick integer,p_teams integer,p_type text)
RETURNS integer LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE v_round integer; v_pos integer;
BEGIN
  IF p_pick<0 OR p_teams<2 OR p_type NOT IN ('snake','standard') THEN RAISE EXCEPTION 'Invalid draft parameters'; END IF;
  v_round:=p_pick/p_teams;
  v_pos:=p_pick%p_teams;
  IF p_type='snake' AND v_round%2=1 THEN RETURN p_teams-1-v_pos; END IF;
  RETURN v_pos;
END $$;
DO $$
DECLARE n int; i int; turn int; previous_turn int;
BEGIN
  FOREACH n IN ARRAY ARRAY[2,3,4,6,9] LOOP
    FOR i IN 0..(n*4-1) LOOP
      turn:=acceptance.team_on_clock(i,n,'snake');
      IF turn<0 OR turn>=n THEN RAISE EXCEPTION 'Team out of range, n %, pick %',n,i; END IF;
      IF i%n=0 AND i>0 AND (i/n)%2=1 AND turn<>n-1 THEN RAISE EXCEPTION 'Snake did not reverse'; END IF;
      IF i%n=0 AND i>0 AND (i/n)%2=0 AND turn<>0 THEN RAISE EXCEPTION 'Snake did not reset'; END IF;
      IF acceptance.team_on_clock(i,n,'standard')<>i%n THEN RAISE EXCEPTION 'Standard turn incorrect'; END IF;
    END LOOP;
  END LOOP;
  IF acceptance.team_on_clock(0,2,'snake')<>0 OR acceptance.team_on_clock(1,2,'snake')<>1 OR acceptance.team_on_clock(2,2,'snake')<>1 OR acceptance.team_on_clock(3,2,'snake')<>0 THEN RAISE EXCEPTION '2-team snake mismatch'; END IF;
  RAISE NOTICE 'PASS: standard and snake ordering for 2, 3, 4, 6 and 9 teams';
END $$;
