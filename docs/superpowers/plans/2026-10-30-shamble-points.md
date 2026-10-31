# Two-team shamble points implementation plan

Goal: Two flexible-size teams, 18-hole shamble, each player saves own strokes; all individual points count.
Architecture: Keep atomic authenticated player RPC and stored strokes. Add pure shared points calculation, use it in leaderboard/progress/player views, and add a distinct shamble_points format. Preserve existing formats. Eagle or better 5, birdie 4, par 3, bogey 2, double 1, worse 0. Scores use actual strokes, no handicap adjustment. Missing is not zero; saved triple bogey is zero.

- [ ] Test pure points, all18, unequal/60-person rosters, edits/clear/invalid entries.
- [ ] Extend own and authorized captain RPCs without granting table writes; test native PostgreSQL permissions/concurrency.
- [ ] Integrate format, all18 entry, player/team points and completion, flexible roster sizing.
- [ ] Review and run native browser/regression acceptance before production migration/deployment.
- [ ] Verify zero live scores before configure existing event to two teams/new format; preserve golfers/accounts and leave assignments to commissioner/draft.

Review focus: stale team ownership, missing vs zero, duplicate scores, unlimited/uneven roster, legacy-format compatibility. No FairwayOS changes, paid services or resumed hourly jobs.

Acceptance addition: stable paginated score loading is required for rounds above 1000 rows. Archive/reset is explicitly disabled for this format until individual score history is preserved atomically. No migration or live event changes before passing native acceptance.
