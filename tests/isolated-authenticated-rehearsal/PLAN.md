# Isolated authenticated draft and scoring rehearsal (November 10)

## Hard safety boundary
- **Never point this rehearsal at the live EllenG Supabase project** `xepccqedhbucpbwuykoc`, production Vercel deployment, or real November 20 draft.
- Do not create golfers, test drafts, picks, or scores in production. No production cleanup scripts.
- Use an ephemeral PostgreSQL/Supabase-compatible local environment on the MacBook runner (or an explicitly authorized separate staging database), with synthetic users and mock identities. Do not create another hosted Supabase project without approval.
- A production URL smoke test is strictly read-only and cannot establish authenticated persistence.
- Do not reuse real player names, passwords, emails, tokens, or snapshots containing player data.

## Setup gate — fail closed
1. Start a disposable local database and local app endpoint; use the existing isolated Playwright harness in `tests/visual` and PGlite tests under `tests/support/weighted-postgres` as starting points.
2. Prove the app's API/auth configuration points only at the disposable endpoint. Fail immediately if environment variables, network requests, or browser storage contain `xepccqedhbucpbwuykoc`, `elleng-cup.vercel.app`, or any production service key.
3. Seed synthetic 22-, 23-, and 24-player fixtures, two captains, commissioner, and two ordinary golfers. Seed all eligible handicap bands; include an unranked participating golfer for a blocked-draft test.
4. Ensure all writes target the disposable database; capture before/after state and delete the local database afterward.

## Required authenticated checks
- Commissioner sign-in, permissions, player totals, participating-only draft list, and unranked draft block.
- Captains are preassigned. Verify A/B first-band protection, weighted legal picks, wrong-captain rejection, timer pause/resume, automatic pick, refresh persistence, and concurrent picks.
- Complete 22 (11/11), 23 (11/12), and 24 (12/12) player drafts. Confirm both commissioner and captain views converge on the same authoritative result.
- Log in as separate golfer accounts in separate browser contexts; enter strokes on par 3 (own ball), par 4 (best drive then own ball), par 5 (best two shots then own ball). Verify point mapping: eagle 5, birdie 4, par 3, bogey 2, double 1, triple+ 0.
- Verify per-golfer score persistence after reload, front/back/total aggregation, leaderboard totals, Gator Hole 10-point bonus and tied split, and no cross-account score editing.
- Test failed saves/offline, stale sessions, retries, and duplicate/concurrent writes. Require clear user feedback and no phantom points.

## Evidence required before claiming end-to-end pass
Record test commit, runner name, run URL, browser contexts, local database identity, per-case results, screenshots/traces on failure, and evidence that production writes were blocked. Distinguish synthetic browser success from real production authenticated success.

## Execution status
**Prepared, not executed as a live authenticated end-to-end rehearsal.** Existing isolated tests passed on PR #66. The current harness blocks network writes; real authenticated persistence requires local auth/API adapters and a disposable database. Do not describe the existing synthetic test as a production multi-user test.
