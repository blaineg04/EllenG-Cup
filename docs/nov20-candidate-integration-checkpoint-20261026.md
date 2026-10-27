# Nov 20 release-candidate integration checkpoint — 2026-10-26

**HOLD: review only. Do not merge, deploy, run production SQL, or test-pick the live `elleng-cup` draft.**

## Exact passing candidate
- PR #9 branch: `release-candidate/nov20-app-only-20261022`
- Candidate SHA `3505e8dbdbcb40d17b61a14116860f7ee1abc4f4`.
- [Safe acceptance run](https://github.com/blaineg04/EllenG-Cup/actions/runs/40425399359): **64 synthetic assertions passed**, synthetic visual matrix **239 views, 0 needs review, 0 startup/navigation errors**.
- [Disposable PostgreSQL contract](https://github.com/blaineg04/EllenG-Cup/actions/runs/40425404695): passed.
- [Score integrity run](https://github.com/blaineg04/EllenG-Cup/actions/runs/40425405013): passed.
- These do **not** establish authenticated two-device or production security/recovery readiness.

## Latest score-integrity branch, not yet incorporated
`release/nov20-score-integrity-20261020` at `c745db5bfe64d841aa7486a36f163cb531979017` passed its three CI jobs ([run](https://github.com/blaineg04/EllenG-Cup/actions/runs/40424628348)).
GitHub compare: branches **diverged (92 ahead / 91 behind)** at this checkpoint; do not merge blindly.
Affected runtime files to reconcile deliberately:
- `admin.html`, `captain.html`: commissioner/captain controls
- `common.js`: shared draft and reconnection logic
- `scoring.html`: individual score editing and save/clear paths
Additional migration/Edge Function proposals need separate database approval; they must not be deployed as part of an app-only release automatically.

## Release gates before sign-off
1. Review runtime diff and reconcile scoring changes on a development integration branch; verify the exact merged candidate SHA using both suites.
2. Isolated authenticated commissioner and two captain browser sessions: ownership, simultaneous picks, timer, auto-pick, reconnection, and public observer.
3. Isolated authenticated golfer/captain scoring: separate devices, concurrent edits, score clear, 9/18-hole paths, Gator Hole and split-pair handling.
4. Realtime publication/RLS privacy review and a verified hosted Supabase backup/recovery procedure before any schema/publication modification.
5. Final visual verification at seven widths and reversible Vercel app-only release procedure.
6. Obtain explicit owner approval before production merge/deployment.

**Safe fallback:** keep current production unchanged if any gate fails. No FairwayOS changes.
