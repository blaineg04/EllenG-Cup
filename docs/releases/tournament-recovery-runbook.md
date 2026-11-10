# EllenG reliability operations

## Targets and boundaries
Only blaineg04/EllenG-Cup, elleng-cup.vercel.app, project prj_wpcMGLHuH21jWarwziP1mo85RBcC, team_K0z3DaMWKG5dYBawap4u3tAH and Supabase xepccqedhbucpbwuykoc. Never substitute FairwayOS credentials or projects.

Known-good application before this work: 3b462169fd078c8b51fb1bee9c588001e90825f0, production deployment dpl_7keqdamMkXsoJ9cpc9PRPQRsArwi. User accepted live behavior. Never run an old deployment workflow as a way of deploying current source: its application commit is pinned.

## Monitoring
Cloud GitHub Actions checks app content, auth service reachability, a bounded database read and anonymous score authorization every five minutes after the workflow is merged into main. GitHub schedules may be delayed. The authorization probe deliberately cannot save a score; this is not an authenticated scoring transaction test. One sanitized incident issue opens after repeated failure and closes after recovery. GitHub notification delivery depends on the owner's repository/Actions notification settings.

An independent hourly connected support task checks project/deployment health and keeps a private versioned logical snapshot. It notifies only for confirmed incidents, performed recovery or required action. Hourly checks are not live, instantaneous support. Neither monitor requires the MacBook to remain on.

## Scores and connectivity
Keep the score page open during weak coverage. Pending scores are stored on that device, scoped to the original user, golfer, team and event. Returning online, focusing the app or the retry timer resumes supported Shamble replay. Replays use authenticated compare-and-set writes; an acknowledged value is not written again, a changed score is held for review. Permission changes and assignment changes are held. Pending entries from the old unscoped queue are retained for manual review, never reassigned to the next signed-in golfer.

If a conflict appears, the golfer opens My Score while online and explicitly saves the correct hole score. That successful save removes only the matching older queued entry. Never clear local storage, reinstall the app or delete pending entries to fix connectivity. Device storage is not a server backup. Offline page reload/first login is not supported by this work.

## Freeze and recovery
No ordinary deployments during the draft next week or November 20 round. Git-triggered deployments are disabled in the candidate configuration; reviewed releases use the MacBook with an explicitly pinned commit. App-version checks show an update notice but do not reload automatically. The app's update button is blocked during live scoring, editing, saves and pending queue work. An administrator can still intentionally deploy via the provider; this is an operating policy, not removal of the owner's control.

Automatic application rollback is limited to a newly changed deployment that repeatedly fails application checks while the known-good deployment and backend are healthy. Reconfirm the current deployment immediately before acting. Rollback is not a treatment for Supabase/provider outages, login issues or isolated golfer errors. Never restore database data automatically. A corrected code patch requires a regression test and review.

## Private backups
EllenG_Cup_Recovery_Snapshot.json contains scoped draft state, tournament settings, captain links, nonsecret golfer-account mappings, RSVP/group assignments and all three score tables. No Auth password hashes, service tokens or browser login state. It is a logical application snapshot, not a full PostgreSQL/Auth/Storage disaster-recovery dump. Keep it private, preserve version history, capture another snapshot immediately before draft and before the round. The independent hourly task refreshes it only after complete reads.

Restoration must preserve existing auth user identities and storage photo references. Validate project/event ids, timestamp, table list and counts. Rehearse typed-row import in an isolated database before any actual restoration. Never overwrite live post-snapshot scores without comparing the newer records and explicit commissioner authorization. Current backups with zero scores do not prove restoration of populated score history; synthetic populated-score tests are required.

## Rehearsal and release gate
Run identity/conflict/duplicate tests, native disposable PostgreSQL CAS tests and seven-width browser checks. Simulate lost network, recovery and account switch in a synthetic event. Do not create live draft picks or practice scores in the real event. Record independently what is implemented, tested, enabled and still pending. After any approved release, update the known-good deployment in both the runbook and support-task prompt.
