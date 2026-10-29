# Pinned scoring migration review

Source commit: a090d2d8c5fbb2d4d3963b7ee3bd9bec22acad7e
Target: EllenG project xepccqedhbucpbwuykoc
Status: REVIEW ONLY; not deployment approval.

## Verification
- Disposable PostgreSQL acceptance: https://github.com/blaineg04/EllenG-Cup/actions/runs/40947141546 (success).
- Score integrity: https://github.com/blaineg04/EllenG-Cup/actions/runs/40947141529 (success).
- MacBook isolated browser rehearsal: https://github.com/blaineg04/EllenG-Cup/actions/runs/40947141583 (success). Uses isolated fixtures, not hosted authenticated sessions.
- Rebuilt coordinated SQL from this source commit; 11 source fingerprints and generated SQL digest verified locally. Digest covers SQL without the generator's trailing output newline.

## Hosted read-only observations, 2026-10-29
- No public functions matching Shamble, Split-Pair, Scramble or score-reset names were returned by pg_proc inspection.
- RLS enabled on all three scoring tables.
- authenticated retains INSERT, UPDATE and DELETE table privileges on all three scoring tables. Row policies still determine permitted rows; these grants alone do not establish a bypass.

## Remaining requirements
Capture and test restoration of hosted schema/score backups; review function ownership and ACLs against that snapshot; produce and rehearse deployable migration and rollback; obtain production approval; then run authenticated two-device scoring with an approved disposable tournament.

The included SQL intentionally aborts and is not deployable. Regenerate from the pinned source and compare review-manifest.json before review. Do not remove the abort for hosted execution. Production has not been changed by this checkpoint.
