# Two-Team Points — persistent scoring design (NOT DEPLOYED)

Status: development proposal only. No SQL has been run on production. Existing Standard EllenG, Split-Pair, draft, Gator Hole, and Final Cargo remain untouched.

## Data model

Use **new, isolated tables**; never overload existing score columns or alter existing scoring-format constraints without a separately reviewed migration.

- `two_team_points_events`: id UUID PK, tournament_id UUID unique FK (after verifying existing schema), status enum setup/live/final, revision BIGINT NOT NULL DEFAULT 0, created_by UUID, created_at, updated_at.
- `two_team_points_teams`: id UUID PK, event_id FK, slot A/B, unique(event_id,slot).
- `two_team_points_roster`: event_id, team_id, player_id, unique(event_id,player_id), FK ensuring team belongs to event; membership changes blocked while live unless a controlled commissioner action is added.
- `two_team_points_scores`: event_id, player_id, hole 1–18, par 3–5, strokes nullable, pickup boolean, points derived server-side, unique(event_id,player_id,hole). Ensure roster membership by FK/transactional validation.

## Atomic score submission

1. Authenticate user. Server derives actor ID from verified JWT, never from request body.
2. Check that actor is assigned golfer, authorized captain, or commissioner for this event using existing membership tables; define captain scope explicitly.
3. In a single database transaction lock the event row (`SELECT ... FOR UPDATE`) or perform conditional update `WHERE revision = expected_revision`; zero rows means conflict.
4. Require live status, valid roster, valid hole/par/strokes/pickup. Use the shared point schedule server-side, never trust client-submitted points.
5. Upsert score by unique(event_id,player_id,hole), increment event revision once, commit.
6. Return committed revision and refreshed aggregate. Clients receiving a conflict refetch and offer retry; do not auto-overwrite.

## Security and availability

- RLS: participants can read only authorized events; golfers write only their own scores unless commissioner/captain permissions explicitly grant more. Never grant client direct writes to revision or computed points.
- Prefer SECURITY INVOKER functions or narrowly scoped SECURITY DEFINER with fixed search_path, explicit JWT role checks, and no public EXECUTE.
- Realtime broadcasts after commit; subscriptions are hints, not a source of truth. Refetch on reconnect, tab resume, and conflicts.
- Require exactly two teams and equal roster sizes when transitioning to live; allow uneven RSVP rosters during setup.
- Define event lifecycle and finalization permissions; finalized scores immutable absent an audited commissioner correction.
- Load-test 30+ players, concurrent saves, retries, duplicates, offline reconnect, and cross-event isolation in a disposable local database.

## Migration gates

1. Inspect actual production schema read-only and confirm FK names, membership/identity model, and existing RLS policies.
2. Implement migration and database integration tests on a local disposable database, with rollback plan.
3. Review authorization and concurrency tests, plus existing-format regression CI.
4. Obtain explicit approval before any live database migration, production deployment, or modification of existing format configuration.
