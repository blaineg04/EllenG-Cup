# Post-deployment developer verification — October 29, 2026
Repository: blaineg04/EllenG-Cup. Production application source inspected at edb9f19646a414b42fa0f28b96de27275acc51dd.

## Automated checks
Command: node --test --test-reporter=tap tests/*.test.cjs
Executed locally in the coding environment on source fetched from the exact commit, with the three test-only corrections in this branch.
Result: 461 tests passed, 0 failed, 0 skipped.
Scope: all 33 root tests/*.test.cjs files. Nested acceptance/integration suites, native PostgreSQL tests and authenticated browser tests are not part of this invocation.
This includes draft turn/timer/reconnect simulations, roster handoff, RSVP session read fencing/reconciliation, commissioner RSVP preview, scoring/points, and score validation.
An initial incomplete workspace produced missing-fixture errors, resolved by fetching the exact referenced files. The complete baseline then produced six failures:
- Four scoring-branch-compatibility cases had invalid format/missing team preconditions and obsolete two-write Split-Pair expectations.
- The Shamble cross-device simulation lacked format and roster inputs.
- The Shamble single-device save-lock harness lacked format and roster inputs.
Test-only corrections supply the real preconditions, require one atomic RPC, and prohibit direct table writes in the navigation-race test. The production application and backend were not changed.
These harness simulations are not real authenticated two-device evidence.

## Deployed player scoring: unresolved consistency risk
Inspected deployed golfer-handicap Edge Function v12, SHA256 66fb1a3605a10b2ff7144492a70472c17630aacad96ba902e82b7df07c83607c.
It validates the caller using auth.getUser, resolves the caller's golfer link server-side, verifies finalized team roster and tournament/draft match, and permits scoring only for setup/live status.
However, its update_score Split-Pair branch uses separate service-role requests to write/delete a pair, read pair values, and write/delete the derived team total.
Inference from that code: concurrent player saves can calculate a stale team total or leave partial state on a later request failure. This was not reproduced against production and is not a reported captain-path failure.
The captain/commissioner page uses the new serialized atomic RPC; today’s successful captain tests do not cover this separate Edge Function path.
No player-specific atomic scoring RPC was found by a catalog search for player-score/my-score/self-score function names.
The standard player branch intentionally retains each golfer's independent 18-hole strokes and does not recalculate the captain-managed low-ball team score. Preserve those semantics when designing a player-specific atomic operation.
Required fix: validate player identity/roster and tournament state inside the same serialized transaction as the score mutation and derived Split-Pair total. Verify success, clear, invalid golfer, closed tournament, failure rollback and concurrent writers on native disposable PostgreSQL before deploying. Do not grant ordinary players captain RPC permissions or send service keys to clients.

## Other verification limits
Deployed draft and legacy RSVP paths have passing local regression coverage above, but this session has not separately executed their authenticated hosted lifecycle.
The event-scoped RSVP rollout remains disabled; tests of staged adapters do not certify a deployed rollout.
Monitoring and password-rotation gaps remain as recorded in docs/releases/2026-10-29-scoring-closeout.md.
No live tournament data, Supabase function, database schema or FairwayOS resource was changed by this verification.
