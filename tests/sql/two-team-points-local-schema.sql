-- EllenG Cup Two-Team Points: LOCAL/DISPOSABLE DATABASE ONLY.
-- Do not execute against production. Independent prototype; no existing tables modified.
BEGIN;
CREATE SCHEMA IF NOT EXISTS elleng_points_dev;
CREATE TABLE elleng_points_dev.events (
 id uuid PRIMARY KEY,
 status text NOT NULL DEFAULT 'setup' CHECK (status IN ('setup','live','final')),
 revision bigint NOT NULL DEFAULT 0 CHECK (revision>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE elleng_points_dev.teams (
 id uuid PRIMARY KEY,
 event_id uuid NOT NULL REFERENCES elleng_points_dev.events(id) ON DELETE CASCADE,
 slot text NOT NULL CHECK (slot IN ('A','B')),
 UNIQUE(event_id,slot),
 UNIQUE(event_id,id)
);
CREATE TABLE elleng_points_dev.roster (
 event_id uuid NOT NULL,
 team_id uuid NOT NULL,
 player_id uuid NOT NULL,
 PRIMARY KEY(event_id,player_id),
 FOREIGN KEY(event_id,team_id) REFERENCES elleng_points_dev.teams(event_id,id) ON DELETE CASCADE,
 UNIQUE(event_id,team_id,player_id)
);
CREATE TABLE elleng_points_dev.scores (
 event_id uuid NOT NULL,
 team_id uuid NOT NULL,
 player_id uuid NOT NULL,
 hole smallint NOT NULL CHECK (hole BETWEEN 1 AND 18),
 par smallint NOT NULL CHECK (par BETWEEN 3 AND 5),
 strokes smallint CHECK (strokes BETWEEN 1 AND 99),
 pickup boolean NOT NULL DEFAULT false,
 PRIMARY KEY(event_id,player_id,hole),
 FOREIGN KEY(event_id,team_id,player_id)
  REFERENCES elleng_points_dev.roster(event_id,team_id,player_id) ON DELETE CASCADE,
 CHECK ((pickup AND strokes IS NULL) OR (NOT pickup AND strokes IS NOT NULL))
);
-- This is intentionally not a production-ready authorization model.
-- No client role may access prototype tables; later integration requires reviewed RLS.
REVOKE ALL ON SCHEMA elleng_points_dev FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA elleng_points_dev FROM PUBLIC;
COMMIT;
