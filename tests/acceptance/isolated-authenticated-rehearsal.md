# Two-golfer authenticated rehearsal — isolated setup

The live Supabase project is NOT a test target. The local `elleng_restore_test` PostgreSQL restore proves schema/data recovery but does **not** provide a working Supabase Auth service or Edge Function gateway. Do not attempt to use its restored `auth.users` records as working local credentials.

## Run only with an isolated authentication service

1. Set up a separate, isolated local Supabase stack **only if its CLI/runtime requirements are installed and feasible**; this is not required for normal CI and must not touch FairwayOS. If no local Auth + Functions environment is available, mark this test blocked instead of using production.
2. Use throwaway test identities A and B, each mapped to separate golfer indices on the same synthetic team. Use synthetic tournament and draft IDs; never reuse `elleng-cup-live` or the existing `elleng-cup` live draft ID.
3. Bring up the exact release-branch `golfer-handicap/index.ts`, with JWT verification and its required service-role environment variables configured privately. Never check credentials into GitHub or screenshots.
4. Verify both logins independently, and that user A cannot write user B's score. Save each golfer's independent scores on holes 1 and 10, including simultaneous saves. Verify four rows with correct owner identities and no derived legacy low-ball team-score rows.
5. Exercise the frontend point model: par 4 scores 3 and 4 earn 4 + 3 = 7 points; Gator Hole doubles them to 14. Incomplete team holes remain pending until everyone on that team's roster has scored. Use team rosters whose size matches test expectations.
6. Reload clients, reconnect realtime, verify persisted records and public/private visibility; perform a clear/edit and confirm exactly one expected row per golfer/hole.
7. Collect sanitized pass/fail evidence, test project ID (never credentials), backend version, app commit SHA, and device/browser screenshots. A local SQL-only test or green CI is insufficient.

## Decision gate

Do **not** mark authenticated rehearsal PASS unless a real login, Function call, database read-back, and multi-device reconciliation all succeeded. Do not promote the production website otherwise. No paid Supabase branch, Docker, or production writes should be introduced without a separate user decision.
