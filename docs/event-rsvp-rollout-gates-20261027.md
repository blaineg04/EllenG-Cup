# EllenG Cup RSVP migration gate — October 27, 2026

Status: **NOT ENABLED**. This checklist applies only to `blaineg04/EllenG-Cup` development branch. FairwayOS is out of scope.

## Verified interface dependencies

- `scoring.html` currently defines `TOURNAMENT_ID="elleng-cup-live"` and `DRAFT_ID="elleng-cup"`; these are different identifiers and must never be interchanged.
- `loadRsvps()` reads `elleng_rsvps` by `draft_id`. `setMyRsvp()` upserts there and deletes the row for Clear RSVP.
- The new `event-rsvp-client.js` reads `elleng_event_rsvps` by `tournament_id` and uses dedicated authenticated RPCs for submit, clear, enrollment and approval.
- The new `event-rsvp-rollout.js` defaults to legacy mode and refuses to fall back to legacy writes when event mode fails.
- A NULL event RSVP status means no attendance response while preserving verified golfer enrollment. Do not count NULL as Playing/Maybe/Out.

## Release gates before enabling event mode

1. Confirm that the live `elleng_tournaments.id` really matches `TOURNAMENT_ID` and references `DRAFT_ID`; never infer from the frontend constant alone.
2. Confirm that every enrolled golfer index refers to the canonical permanent golfer directory for that event and matches the signed-in Supabase account. The commissioner enrollment RPC currently validates account existence and index uniqueness, **not** directory membership; fix this before rollout.
3. Review SQL functions, grants, RLS and commissioner ownership against the real isolated EllenG Supabase schema. The proposed SQL is not deployed. Revoke/withhold browser EXECUTE grants until authenticated testing validates the intended access paths.
4. Migrate or reconcile existing draft-scoped RSVP rows to the event-scoped table with a one-time, reversible mapping reviewed by the commissioner. Never infer approval from legacy Playing status; new approvals must start pending.
5. Run two-account authenticated tests: own RSVP; cross-account denial; commissioner enrollment and approval; unapproved Playing excluded from draft; cleared RSVP excluded; draft first-pick lock; second event isolation.
6. Test mobile widths 320, 375, 390, 430 and desktop widths 1024, 1440, 1920 for Players RSVP, pending/approved status, error feedback, and counts.
7. Verify backup and rollback to legacy mode **without writing to both RSVP tables**. Obtain explicit production deployment approval.

## Deployment decision

Do not load the event-mode controller into the production Players page until gates 1–7 pass. CI-only adapter tests and disposable PostgreSQL acceptance are necessary but do not prove live Supabase authentication or the production tournament mapping.
