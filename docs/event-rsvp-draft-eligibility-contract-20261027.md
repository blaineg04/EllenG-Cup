# EllenG Cup — event-scoped RSVP and draft eligibility contract

Status: development proposal only. Do not apply to the live tournament until authenticated acceptance passes.

## Existing behavior confirmed
- The player UI in `scoring.html` loads `elleng_rsvps` by `draft_id` and upserts by `(draft_id,user_id)`.
- Current database columns are `draft_id,user_id,golfer_index,status,note,updated_at`. There is no tournament/event identifier or commissioner approval field.
- The commissioner currently can reset all draft-level RSVPs; that operation is **not** an approval mechanism.
- The existing 34-person golfer directory must remain unchanged.

## Required data contract
1. Each event has a stable `tournament_id` linked to a draft; the same golfer can RSVP independently for different events.
2. An RSVP is uniquely identified by `(tournament_id,user_id)`. Store `status` as playing/maybe/out, and a separate `approval_status` as pending/approved/declined. Keep historical event responses.
3. Player may create/change only their own RSVP for an open event. Commissioner may approve/decline event responses; captain cannot approve.
4. Approval is only valid for a `playing` RSVP; changing from playing to maybe/out invalidates previous approval.
5. Draft setup imports only approved, playing, event-linked golfers. Preview roster and show excluded/pending/missing players before explicit commissioner confirmation.
6. Draft eligibility must be validated server-side when saving setup or making a pick; a client-side filter alone is insufficient.
7. Lock the roster once the draft begins. Reopening requires an explicit commissioner-only audited action, not a silent RSVP change.
8. Preserve existing `elleng_rsvps` records and the paused draft. Migration must be additive and backfill must be explicitly reviewed; do not auto-assign historical RSVPs to November 20.
9. Support flexible team counts, including two teams with larger rosters, without changing the permanent player directory.
10. Realtime subscribers must see roster approval and draft changes after authorization checks; no service-role key in browsers.

## Release acceptance
- Two different tournament events retain independent RSVP statuses for the same user.
- Captain A cannot edit captain B's RSVP or commissioner approvals.
- A player marked out/maybe/pending cannot be drafted, including through direct RPC calls.
- Commissioner approves a playing RSVP and it becomes eligible in the correct event only.
- Changing an approved RSVP to out removes eligibility before the roster lock.
- Once locked, new RSVPs do not alter draft participants or existing picks.
- Existing paused draft and player directory remain byte-for-byte unchanged until a reviewed migration and explicit release approval.
