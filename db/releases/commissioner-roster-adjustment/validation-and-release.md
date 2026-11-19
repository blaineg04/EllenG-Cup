# Commissioner roster adjustment — required release validation

Target: EllenG Cup November 20, 2026 only. No production writes until all checks pass.

## Planned changes (zero-based golfer indices)
- 56 Connor Castille: unassigned/not participating -> Team Carl (0), participating
- 15 Michael Glover: Team Carl (0) -> Team Jarad (1)
- 7 Donny Wyble: Team Jarad (1) -> Team Carl (0)
- 20 Patrick Carlton: Team Jarad (1) -> Team Carl (0)

## Mandatory isolated PostgreSQL tests
1. Apply staged-rpc.sql and guard-staged.sql in a disposable database using a schema equivalent to production.
2. Authorized commissioner: execute each change with current updated_at; confirm golfers.team, rosters, picks, participation agree; no duplicates.
3. Unauthorized authenticated user and anonymous user: both rejected with no writes.
4. Direct UPDATE to drafts by an authenticated user: rejected by guard.
5. Stale updated_at: rejected, no writes.
6. Scoring race: lock tournament and draft; score insert and roster change must serialize; changes rejected once any score exists.
7. Group assignments: rejected if assignments exist.
8. Captain change: rejected; withdrawn golfer change: rejected.
9. Other golfers, captain identities, scoring rows, and non-roster state remain unchanged.
10. Retried move to same team rejected without duplicating roster entries.
11. Failed move rolls back entirely.
12. Verify the guard does not break existing authorized withdrawal/restore or ordinary non-roster changes.
13. Authenticated API test using actual commissioner token, not just service role.

## Important integration note
The current staged RPC updates draft picks for moved golfers. That deliberately changes
the recorded pick's team assignment, so historical draft team selection is NOT preserved
byte-for-byte. If historical picks must remain immutable, introduce a separate override
mapping and update every scoring/roster consumer to resolve it. Do not deploy until this
tradeoff is reviewed.

## Deployment gates
- Review SQL security-definer ownership and permissions; restrict execute to authenticated.
- Confirm production setup, zero scoring rows, zero group assignments immediately before write.
- Take a private backup/snapshot of exact draft state before release.
- Use a commissioner-authenticated RPC call with expected_updated_at.
- Read back all four assignments, both rosters, pick ownership, and score row counts.
- Confirm production app Teams and scoring views agree across two devices.
- Do not disable the weighted-roster trigger or directly patch production JSON.
