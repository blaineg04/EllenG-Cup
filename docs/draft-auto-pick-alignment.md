# EllenG Cup automatic-pick alignment review

Status: **Proposal only — not deployed**

## Verified behavior

- `common.js` computes a per-band balance penalty and permits any remaining band with the minimum penalty.
- The live `elleng_make_pick(text,integer)` function also uses `elleng_pick_balance_penalty` and compares each remaining eligible band against the minimum penalty.
- The live `elleng_auto_pick(text)` function instead filters candidates using zero-imbalance conditions for the selected band and combined A/B counts.
- Both pick functions lock the draft row with `FOR UPDATE`; the automatic picker checks expiry before writing and restarts the timer.

## Potential failure

When all remaining golfers carry a positive balancing penalty for the current team, the manual path permits the lowest-penalty choice, but the automatic path can produce no candidates and raise `No eligible golfers available for automatic pick`. This may stall an expired turn.

## Proposed database change (requires separate approval)

Within `elleng_auto_pick`, replace its candidate filtering with the same penalty-minimum calculation used by `elleng_make_pick`. Keep:
- authenticated draft membership checks;
- draft row locking;
- paused/expired timer checks;
- golfer name, unassigned status and valid band checks;
- exactly one pick and one timer restart per committed transaction.

Do not execute this against the live database until isolated test coverage and a migration review are complete.

## Test plan

1. Verify uneven rank mixes and final-remaining-golfer fallback in isolated fixture data.
2. Verify manual and auto candidate sets are identical for the same state and current team.
3. Simulate two simultaneous expired-timer calls; assert at most one pick for the same turn.
4. Verify early calls, paused drafts, and unauthorized callers cannot advance a turn.
5. Verify the next turn and deadline advance only after a successful pick.

## Boundaries

No live tournament picks, scores, handicap records, or production configuration should be modified as part of this review.

## Isolated database verification procedure

Use a **separate disposable Supabase test project**, never the live EllenG project. Import the relevant schema/functions into the test project and seed only fictional draft IDs, captains, golfers, and timers. Do not copy real player credentials or live tournament records.

1. Capture the current SQL definitions and grants for `elleng_make_pick`, `elleng_auto_pick`, `elleng_pick_balance_penalty`, and their dependent tables/functions.
2. Create a fixture with two teams and four golfers: `A,A,B,C`. Assign team 0 an A and a B, and team 1 a C. Set the current turn to team 0, with the final A unassigned and timer expired.
3. Under a test captain identity, check the manual function accepts the final A in a **separate transaction/fixture**. Check the unmodified automatic function rejects the same candidate; record its error.
4. Reset the fixture. Apply a candidate automatic-pick function **only to the disposable project** that selects the minimum penalty across remaining unassigned golfers.
5. Assert one automatic pick is persisted, the turn advances, and the deadline restarts. Repeat with two concurrent callers to verify only one pick for the expired turn.
6. Repeat for paused drafts, non-expired turns, unauthorized identities, and already-completed drafts. Confirm none can write a pick.
7. Review results and the exact migration diff before requesting explicit approval for any live function change.

**Release gate:** do not deploy the database correction unless all isolated tests pass and the user separately approves the production migration.
