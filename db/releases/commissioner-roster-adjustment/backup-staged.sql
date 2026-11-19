-- STAGED ONLY. Run in production only after final release approval.
-- Store a complete immutable copy of the original draft row BEFORE installing
-- the commissioner move RPC or changing any golfer.
CREATE TABLE IF NOT EXISTS public.elleng_roster_release_backups (
 backup_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 draft_id text NOT NULL,
 original_owner_id uuid NOT NULL,
 original_updated_at timestamptz NOT NULL,
 original_state jsonb NOT NULL,
 state_md5 text NOT NULL,
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 release_tag text NOT NULL UNIQUE
);
REVOKE ALL ON TABLE public.elleng_roster_release_backups FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.elleng_roster_release_backups_backup_id_seq FROM PUBLIC,anon,authenticated;
-- Run this INSERT once under the migration/administrative role only.
-- ON CONFLICT is intentionally omitted so accidental retries fail closed.
INSERT INTO public.elleng_roster_release_backups
 (draft_id,original_owner_id,original_updated_at,original_state,state_md5,release_tag)
SELECT id,owner_id,updated_at,state,md5(state::text),'elleng-cup-2026-11-20-pre-roster-move'
FROM public.elleng_drafts
WHERE id='elleng-cup'
 AND (SELECT status FROM public.elleng_tournaments WHERE id='elleng-cup-live')='setup'
 AND NOT EXISTS (SELECT 1 FROM public.elleng_player_hole_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS (SELECT 1 FROM public.elleng_team_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS (SELECT 1 FROM public.elleng_pair_hole_scores WHERE tournament_id='elleng-cup-live')
 AND NOT EXISTS (SELECT 1 FROM public.elleng_group_assignments WHERE draft_id='elleng-cup');
-- Fail rather than proceeding without a snapshot.
DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.elleng_roster_release_backups
     WHERE release_tag='elleng-cup-2026-11-20-pre-roster-move')<>1
 THEN RAISE EXCEPTION 'No unique pre-release roster snapshot captured'; END IF;
END $verify$;
-- Verify snapshot checksum and timestamp before proceeding to release.
SELECT backup_id,draft_id,original_updated_at,state_md5,captured_at
FROM public.elleng_roster_release_backups
WHERE release_tag='elleng-cup-2026-11-20-pre-roster-move';
