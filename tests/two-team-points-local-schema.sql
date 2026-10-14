-- DEVELOPMENT TEST ONLY. Run in disposable local PostgreSQL database.
-- Does not reference existing EllenG production tables or identities.
BEGIN;
CREATE SCHEMA IF NOT EXISTS elleng_points_test;
CREATE TABLE elleng_points_test.events (
 id uuid PRIMARY KEY, status text NOT NULL DEFAULT 'setup'
  CHECK(status IN ('setup','live','final')),
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0)
);
CREATE TABLE elleng_points_test.teams (
 id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES elleng_points_test.events(id) ON DELETE CASCADE,
 slot text NOT NULL CHECK(slot IN ('A','B')),
 UNIQUE(event_id,slot), UNIQUE(event_id,id)
);
CREATE TABLE elleng_points_test.roster (
 event_id uuid NOT NULL, team_id uuid NOT NULL, player_id uuid NOT NULL,
 PRIMARY KEY(event_id,player_id),
 FOREIGN KEY(event_id,team_id) REFERENCES elleng_points_test.teams(event_id,id)
);
CREATE TABLE elleng_points_test.scores (
 event_id uuid NOT NULL, player_id uuid NOT NULL, hole smallint NOT NULL CHECK(hole BETWEEN 1 AND 18),
 par smallint NOT NULL CHECK(par BETWEEN 3 AND 5),
 strokes smallint CHECK(strokes>=1), pickup boolean NOT NULL DEFAULT false,
 PRIMARY KEY(event_id,player_id,hole),
 FOREIGN KEY(event_id,player_id) REFERENCES elleng_points_test.roster(event_id,player_id),
 CHECK((pickup AND strokes IS NULL) OR (NOT pickup AND strokes IS NOT NULL))
);
COMMIT;
