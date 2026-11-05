# Weighted draft release candidate

Status: development only. Installation does not change existing tournament rows.

The two-team model uses submitted A=5/B=3/C=2/D=1 strength units. This emphasizes the sole A captain enough to permit extra B depth on the other team. These units approximate skill bands; they are not stroke handicaps, predicted points, or a claim that every A is exactly equivalent to a certain combination of Bs. Exact handicaps remain optional and are not used by this model.

For each current roster, enumerate every feasible final A/B/C/D count split. Respect assigned captains/players and team capacity from the selected snake/straight order. First minimize average strength difference (integer cross-products for odd totals), then squared differences in each band's proportional distribution. A pick is eligible only if at least one equally optimal final allocation still contains it. Thus any legal sequence retains the initial best attainable result for a fixed roster/bands. An uneven field need not have a zero gap; this is displayed as best available balance, not guaranteed equal ability. Unequal golfer counts still create a team-scoring advantage because every golfer's points count; per-place skill balance does not remove that scoring issue.

Scope: recurring EllenG two-team tournaments. More-than-two-team formats retain the existing algorithm and are not labeled weighted.

## Release order
1. Run `node --test tests/weighted-draft.test.cjs tests/weighted-admin-behavior.test.cjs tests/draft-turn-order.test.cjs tests/draft-submitted-band.test.cjs tests/commissioner-session-fence.test.cjs tests/draft-participant-scope.test.cjs`.
2. Run `npm ci --prefix tests/support/weighted-postgres --ignore-scripts --no-audit --no-fund`, then `PGLITE_MODULE="$PWD/tests/support/weighted-postgres/node_modules/@electric-sql/pglite" node tests/weighted-draft-postgres.cjs`. This is disposable PostgreSQL/WASM; it never connects to Supabase.
3. Review/install `install.sql` against EllenGCup only. Preserve a read-only recovery snapshot and original RPC definitions first. Install before publishing the new client. The installer fails closed if existing RPC markers differ.
4. Publish the reviewed source. Show `weighted-draft-preview.html` for a synthetic, read-only-of-production demonstration.
5. With all playing golfers' bands submitted, pause the existing draft and click **Prepare Balanced Draft**. It accepts an empty draft or only its two captains already drafted in team order. Ordinary picks are never silently reset. New two-team setup saves prepare automatically and remain paused until resumed.

Captain names must match exactly one playing golfer, ignoring case and outer spaces. Duplicate/missing captain names require correction. Preparation seeds each captain on the appropriate team as the first two picks and keeps the clock paused. Undo cannot remove those seeds. A database trigger locks playing roster, names and submitted bands during the draft, including updates through profile services. Photos remain editable. Commissioner saved band/assignment edits are locked in weighted mode; ordinary picks can be undone one at a time. Captain/manual/timeout and legacy full-state commissioner writes are enforced server-side. No rules are changed in an already-running legacy draft merely by installing functions.

## Validation
- 360 independent JS/PostgreSQL state comparisons across one/multiple/no A golfers, odd counts and sparse bands.
- Independent subset-enumeration oracle and every legal path through a sample draft.
- Captain, commissioner and timeout entry points, unauthorized users, missing seeds, old commissioner save bypass, and idempotent installation.
- Full repository Node run: 616 tests; 613 passed. Three failures reproduce unchanged on base commit 0056960: `staged shamble scoring clears incomplete team totals using restricted definer privileges`, `Shamble browser makes one atomic server call and no direct score-table writes`, and `Shamble browser fails closed on unavailable RPC and does not write raw tables`. They concern existing scoring acceptance fixtures, outside this change.

## Recovery
Do not drop these functions or remove client support while any tournament has `draftRules=weighted`. Pause first and retain compatible handlers. To roll back before activation, restore the captured original `elleng_make_pick`, `elleng_auto_pick` and `elleng_save_state_if_fresh` definitions and the prior client. Do not silently downgrade or delete a drafted roster.
