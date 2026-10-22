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

-- Every complete round must give each team exactly one pick, including uneven
-- golfer totals that end in the middle of a round.
DO $$
DECLARE teams int; golfers int; pick int; round_no int; pos int; team_no int; seen integer[];
BEGIN
  FOREACH teams IN ARRAY ARRAY[2,3,4,6,9] LOOP
    FOREACH golfers IN ARRAY ARRAY[8,17,24,29,32,36] LOOP
      FOR round_no IN 0..((golfers-1)/teams) LOOP
        seen := array_fill(0,ARRAY[teams]);
        FOR pos IN 0..teams-1 LOOP
          pick := round_no*teams+pos;
          EXIT WHEN pick>=golfers;
          team_no := acceptance.team_on_clock(pick,teams,'snake');
          seen[team_no+1] := seen[team_no+1]+1;
          IF seen[team_no+1]<>1 THEN RAISE EXCEPTION 'Repeated team %, round %, teams %, golfers %',team_no,round_no,teams,golfers; END IF;
        END LOOP;
        IF round_no < (golfers/teams) THEN
          FOR pos IN 1..teams LOOP
            IF seen[pos]<>1 THEN RAISE EXCEPTION 'Missing team %, round %, teams %',pos,round_no,teams; END IF;
          END LOOP;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RAISE NOTICE 'PASS: unique team turns in complete and partial snake rounds';
END $$;
