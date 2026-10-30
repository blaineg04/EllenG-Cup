# Scoring release closeout — October 29, 2026
Timezone: America/Chicago. Repository: blaineg04/EllenG-Cup only.

## Deployment and scope
Production: https://elleng-cup.vercel.app
Scoring implementation: a090d2d8c5fbb2d4d3963b7ee3bd9bec22acad7e.
Temporary acceptance deployment: b53bc96ff7dc9993a422d6e334b6db68160b1ef1; Vercel dpl_9QSNP38cFC4iHpzLt2BZg9iHkeoD.
The production scoring.html file was byte-identical to the original deployed implementation when the acceptance page was published.
The closeout changes only retire acceptance-scoring.html, update its isolation test, and add this receipt; they do not change production scoring behavior.
Supabase project: xepccqedhbucpbwuykoc.
Installed coordinated migration SQL SHA256: 049988581409c8cff326fd2a506c4ddd40f43e9a977c8c9e7dd39ef2df63b8b4.
GitHub main was reconciled with the deployed scoring source.

## User-observed authenticated acceptance
The organizer operated the commissioner session on a phone and a distinct captain session on a computer, and explicitly confirmed each result in the interactive conversation. These are user-observed results, not automated browser assertions.
- Standard Hole 1 save: 4 strokes appeared automatically on the other device.
- Edit to 5 strokes synced automatically; refresh on both devices retained 5.
- Captain reported other teams were not editable. An initial contrary answer was explicitly corrected by the user.
- Shamble Hole 10: individual 4,5,6,7 produced team low 4.
- Editing first golfer to 8 recalculated team low to 5 across devices.
- Clearing fourth golfer removed the completed team result and showed 3/4 valid scores.
- Restoring fourth golfer restored completion.
- Split-Pair Hole 1: 18+19 produced 37 across devices.
- With phone offline, captain changed first pair to 17; reconnecting the phone caught up to 17+19=36 without refresh.
- Commissioner Clear Scores Only cleared pair and team scores on the captain device.

Database observation independently confirmed Standard Hole 1=5 was written by a non-owner account assigned only to captain team index 0.
After the user cleared Split-Pair, its three score tables each contained zero rows.
This UI restrictions check does not independently prove rejection of every forged API request, simultaneous conflicting write, or every role/session-expiry scenario.

## Test retirement
Fixed synthetic tournament IDs:
- elleng-acceptance-standard-20261029
- elleng-acceptance-split-20261029
Their corresponding draft IDs end in -draft-20261029.
Both tournament and draft statuses were changed to archived. Records are retained as evidence; no test Auth accounts were created or deleted.
Archived status prevents scoring RPC writes, including from stale open test pages.
The test page becomes an inert notice with a link to production; no script, form, Supabase client, or RPC remains.
The real tournament elleng-cup-live remains setup with zero team, player, and pair scores.
Its fingerprint before/after fixture creation was c3b1cc4604aeb3f6a38a67f032a80d0e.

## Recovery
A private original SQL dump was completed and permission-restricted on the organizer's Mac. It was not uploaded to this repository.
576992 bytes; SHA256 e82e5ee20d37afb4839ef3f911f490c243f89e5620f2f4cc4b59c77a344fc5ef.
Native PostgreSQL application-scope recovery and coordinated reversal evidence:
https://github.com/blaineg04/EllenG-Cup/actions/runs/40961664529
This run was read back as completed/success during closeout.
The native recovery copy excludes unavailable Vault extension sections; it does not prove full Supabase platform/Auth/Storage/Vault recovery.
Original backup remains unchanged. Native PostgreSQL 18 versus hosted PostgreSQL 17.6 remains a compatibility limitation.
Rollback must coordinate app and database permissions. Do not roll back the app alone: old clients require direct score-table writes now revoked.
The reversal rejects existing totals above 20. Preserve scores and use forward repair when blocked; never delete valid scores merely to downgrade.
Before future schema changes, obtain a fresh private backup and verify the current artifact and recovery procedure.
Historical recovery artifacts live on development/nov20-release-reconciliation-20261026 under db/releases/scoring-a090d2d8; do not treat older review-only headers as an installation instruction.

## Production checks and limits
The following Supabase Edge Functions were observed ACTIVE: captain-admin v4, trash-talk v4, golfer-handicap v12, player-admin v6, player-profile v6, player-self-rank v2. Deployment status alone does not prove end-to-end correctness.
Scoring test page intentionally blocked ancillary Edge Function calls and automatic player-account provisioning. Its acceptance does not certify player-profile, My Score, RSVP, or draft flows.
Production event-scoped RSVP rollout remains disabled; existing legacy RSVP remains the applicable path.
No Vercel external log drains are configured. A corrected 30-minute production error/fatal runtime-log query returned no matching logs. The initial one-hour query failed retention validation. Static-browser and Supabase errors are not covered by Vercel function logs.
Supabase security advisor flagged seven authenticated SECURITY DEFINER entrypoints (including the intended scoring RPCs); these require caller authorization and are not automatically vulnerabilities or safe merely because tests passed.
Advisor also flagged leaked-password protection disabled and two RLS-enabled legacy tables without policies (elleng_golfer_pins, elleng_trash_talk_settings). No privileges were broadened during closeout.
Remediation references:
https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Remaining developer work
- Verify authenticated production draft lifecycle, player self-scoring, and legacy RSVP separately in a safe test setup. Do not test against real tournament records.
- Configure browser/backend error reporting using existing/free resources; none was silently purchased or enabled.
- Rotate the database password exposed earlier, if not already rotated; confirmation remains outstanding. Do not publish credentials or revoke unrelated API keys.
- Full hosted-platform disaster recovery remains outside the proven application restore scope.
All EllenG ChatGPT hourly automations were paused at the user's request; do not restart them without instruction.
Tournament roster, captain selection and official draft setup are organizer tasks, separate from the developer closeout.
