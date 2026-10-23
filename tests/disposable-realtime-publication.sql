-- Publication membership contract for a disposable PostgreSQL database.
-- Models the targeted migration but never applies it to live Supabase.
CREATE TABLE acceptance.realtime_player_scores(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
CREATE TABLE acceptance.realtime_pair_scores(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY);
CREATE PUBLICATION elleng_ci_realtime FOR TABLE acceptance.drafts;
ALTER PUBLICATION elleng_ci_realtime ADD TABLE acceptance.realtime_player_scores;
ALTER PUBLICATION elleng_ci_realtime ADD TABLE acceptance.realtime_pair_scores;
DO $$
DECLARE missing integer;
BEGIN
 SELECT count(*) INTO missing FROM (
   VALUES ('drafts'),('realtime_player_scores'),('realtime_pair_scores')
 ) required(tablename)
 WHERE NOT EXISTS (
  SELECT 1 FROM pg_publication_tables p
  WHERE p.pubname='elleng_ci_realtime' AND p.schemaname='acceptance'
    AND p.tablename=required.tablename
 );
 IF missing<>0 THEN RAISE EXCEPTION 'Publication missing % required tables',missing; END IF;
 RAISE NOTICE 'PASS: disposable publication contains draft, player and pair score tables';
END $$;
