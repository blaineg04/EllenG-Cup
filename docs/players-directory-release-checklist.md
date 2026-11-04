# Players directory release checks

## Confirmed read-only live audit (November 3, 2026)

- 36 existing golfer accounts remain in the database; no account resets or reassignment performed.
- The current draft state contains 23 named golfer entries, all marked participating.
- 23 accounts map to those named entries; 13 other accounts have indices beyond the current draft golfer array.
- User confirmed **all 23 named golfers are participating** on November 20. Do not reduce the roster to 22. Additional golfers are expected before November 20. Do not finalize or rebalance teams yet; confirm teams and matchups after registration closes.
- The account-only directory fallback currently uses username, not a verified full name or linked player profile. Do not claim it provides full golfer profiles.
- The authenticated `player-public-roster` Edge Function is committed on this branch but is not confirmed deployed to production.

## Release gates

- [x] Preserve all registered accounts; do not reset passwords or reassign accounts.
- [x] MacBook scoring and responsive isolated tests passed on commit `dc4102c` (164 contracts; 246 browser views, zero issues). Synthetic ordinary-golfer browser checks verify all **13** account-only nonparticipants are visible and correctly labeled across seven widths, and searching for a specific reserve returns one matching account. The source contract also verifies 23 participants plus 13 preserved nonparticipants yield a draft count of 23. Database acceptance and November 20 score integrity passed. This is **not** a live authenticated 36-account verification.
- [x] MacBook roster-outage regression passed on `b6a7a50` (164 tests, 253 browser views, zero layout/navigation issues); all seven widths show the outage notice while retaining the tournament golfer directory. Disposable PostgreSQL acceptance and November 20 scoring integrity also passed. This remains isolated fixture verification, not a live authenticated account check.
- [x] User confirmed all 23 currently participating golfers are playing November 20; preserve all 23.
- [ ] Verify the 13 account-only users' correct full-name mappings with an authorized source before displaying profile links.
- [ ] Verify all 36 registered golfers appear in the Players directory for a noncommissioner account, including account-only entries.
- [ ] Verify all 23 active golfers appear in the draft and scoring, the 13 account-only users stay out, and team assignments/matchups are finalized only after registration closes.
- [x] Confirm the handicap display behavior is present in the development release candidate: public directory shows bands, stale unranked HCP is hidden in personal view, and unranked commissioner editor HCP is blank (source regression checks passed on `f547bf0`).
- [ ] Confirm those handicap display changes are included in the approved production deployment.
- [ ] Confirm the authenticated roster function's deployment and authorization before switching production directory behavior.
- [ ] Obtain approval before the single bundled production deployment.

Do not alter the live draft, scoring, or production database during verification.
