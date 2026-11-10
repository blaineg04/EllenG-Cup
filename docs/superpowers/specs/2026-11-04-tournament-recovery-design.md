# EllenG tournament reliability

User-approved goal: independently detect faults, recover common interruptions, preserve scores, retain private recovery snapshots, and prevent disruptive changes during the draft and tournament.

## Approach
Use existing GitHub cloud runners for five-minute read-only public/API health probes (schedules can be delayed), plus an hourly independent support task for authenticated project checks, private logical snapshots and narrowly guarded rollback. Neither depends on the MacBook staying on. The MacBook remains the existing deployment/test worker. No new paid service or Supabase project.

Harden the browser's offline queue with golfer/tournament/event identity, latest-edit coalescing, serial retries, preservation of concurrent edits, and storage-failure reporting. A new authenticated compare-and-set RPC supports only this event's two-team individual shamble and rejects stale or reassigned scores. Unscoped legacy entries require review and are never replayed under an arbitrary login. Offline reload/login is not guaranteed; keep an already-open score page available.

Stop automatic page reloads for updates during live scoring, pending saves, editing, or queued scores. An explicit update remains available when safe. Freeze ordinary deployments during the draft/round; verified incident rollback remains an exception. No unattended code generation or score/database restore during play.

Private hourly logical snapshots cover tournament configuration, draft/roster and score tables, not auth credentials or a full Supabase disaster recovery dump. Restoration is explicit and must be rehearsed in an isolated database before being called verified. Capture additional pre-draft and pre-round snapshots. Never put user data or auth state in public GitHub artifacts/issues.

## Alternatives
MacBook-only checks would fail when the laptop sleeps. A new external monitor/backup service adds account and cost setup. Existing cloud GitHub checks plus the authorized connected support task fit the current app; failures still may require developer/provider intervention.

## Release gates
No changes to current registrations, team assignments, draft picks or scores while testing. Regression tests demonstrate account switching, replay conflicts, duplicate requests, concurrent queue edits, storage failure and update freeze. Review and preview before replacing the approved production release. Report separately what is implemented, enabled and still awaiting validation.
