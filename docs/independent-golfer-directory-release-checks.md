# Independent golfer directory release checks (PR #87)

## Scope
The November 20 draft and scoring history must remain unchanged. Directory registration is a separate operation and must not call `elleng_set_player_participation` or save `elleng_drafts.state`.

## Required isolated tests (NOT yet executed)
1. In disposable Supabase, run migration, sign in as commissioner, register a golfer with `Not playing`. Verify exactly one `elleng_golfer_directory` row and **no changes** to `elleng_drafts`, `elleng_tournaments`, scoring tables, captain assignments or picks.
2. Repeat same name with different case/leading spaces. Expect duplicate rejection and one row only.
3. Anonymous, regular golfer and captain must be unable to invoke registration or read another commissioner's directory. Verify RLS and RPC grants.
4. With tournament status `complete`, `completed`, and `archived`, ensure Add Golfer calls only directory RPC. `Playing` must be rejected.
5. With migration absent, show an error and do not fall back to historical draft writes.
6. Refresh and verify directory entry remains visible. Validate handicap/band, special characters and invalid fields.
7. Confirm photo file uploads are blocked on completed tournaments until directory-specific photo storage exists; photo URL remains optional.
8. Confirm November 20 draft, teams, scores, leaderboards, account mappings and tournament archive are byte-for-byte unchanged.
9. Verify new-tournament enrollment, player login provisioning, and migration of pre-existing golfers before production release.

## Release gate
Do not merge or deploy PR #87 until all tests pass, directory account linking and future-tournament enrollment are implemented, and a rollback plan is approved. Never test mutations against the November 20 production data.
