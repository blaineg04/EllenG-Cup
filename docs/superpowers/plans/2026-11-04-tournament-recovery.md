# Tournament recovery implementation plan

**Goal:** Protect tournament play against common connection failures and detect/escalate failures independently.
**Architecture:** Small browser queue module plus authenticated conditional score RPC; cloud probes and a private hourly recovery task. Preserve current scoring rules.
**Spec:** docs/superpowers/specs/2026-11-04-tournament-recovery-design.md

## Constraints and review focus
EllenG only: xepccqedhbucpbwuykoc / blaineg04/EllenG-Cup / elleng-cup.vercel.app. Never touch FairwayOS. No live score writes in verification. Queue identity must survive account switches and event resets; no stale overwrite. Health-check bodies and private snapshots must not enter public logs. Rollback cannot fix provider/network outages. No automatic data restoration. Monitor scheduling is best effort, not a five-minute SLA.

### Task 1: Score recovery and update freeze
- [ ] Test queue isolation, coalescing, concurrent replay edits, storage errors, ambiguous acknowledgments and conflict retention before implementation.
- [ ] Implement offline-score-queue.js and integrate with My Score using a conditional RPC; tests/offline-score-queue.test.cjs exercises real module behavior.
- [ ] Test and implement authenticated shamble compare-and-set SQL in db/releases/tournament-reliability/offline-score.sql, verified in native disposable PostgreSQL.
- [ ] Test update policy, block automatic reload during live play or pending work, expose safe manual refresh.

### Task 2: Independent monitoring
- [ ] Write failure-first tests for retries, timeout, content validation and sanitized output.
- [ ] Implement scripts/tournament-health.cjs and a five-minute ubuntu-latest workflow; probe public app/auth/data/score authorization without changing scores or using golfer credentials.
- [ ] Create/update one sanitized incident issue on confirmed failures and close on recovery; no personal data or raw upstream errors.

### Task 3: Recovery operations
- [ ] Capture a private logical recovery snapshot and validate its manifest/counts; define isolated restore rehearsal.
- [ ] Configure independent hourly support task, quiet when healthy, private snapshots and guarded application-only rollback to verified stable deployment; no database restore.
- [ ] Keep production freeze policy and operator runbook with exact rollback target and conditions.

### Task 4: Review and release
- [ ] Run targeted and broad existing tests plus MacBook browser matrix and native database rehearsal on candidate.
- [ ] Independent whole-branch review, fix important findings, create concrete preview and report active versus pending protections.

## Progress ledger
Initial ruling: Implement inline in the isolated reliability branch; user approved the protection plan. Existing production stays at approved 3b46216 until the candidate is reviewed.
