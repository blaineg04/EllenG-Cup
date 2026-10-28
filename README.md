# EllenG Cup — Multi-Captain Live Draft

Pages:
- `index.html`: public spectator board
- `admin.html`: commissioner controls
- `captain.html`: all six captains use this page and sign in with their own account

How captain drafting works:
1. Commissioner sets up the 24 golfers, A/B/C/D bands, handicaps, teams and timer.
2. Each captain signs into `captain.html`.
3. Supabase maps that authenticated user to Team 1–6 using `elleng_captains`.
4. Only the captain whose team is currently on the clock gets enabled Draft buttons.
5. The A/B/C/D balance rules are enforced in the interface.
6. A successful pick saves to Supabase; Realtime updates every captain and spectator screen.
7. The next team's clock begins from the shared saved timestamp.

Setup:
1. Run `supabase.sql`.
2. Create commissioner + six captain users in Supabase Authentication > Users.
3. Initialize/save the draft from `admin.html` as commissioner.
4. Copy each captain user's UUID from Authentication > Users.
5. Run the six sample `insert into public.elleng_captains...` rows shown at the bottom of `supabase.sql`, replacing CAPTAIN_X_UUID.
6. Put Project URL and publishable key in `config.js`.
7. Host all files together.

Security:
- Spectators can read only.
- Captains must authenticate.
- Captain accounts are mapped to a specific team.
- Commissioner retains setup/undo/timer control.
- Never place a Supabase secret/service-role key in these browser files.

Note:
The database RLS authorizes registered captains to update the shared draft row. The captain page additionally enforces turn ownership and ABCD eligibility. For adversarial/public-internet hardening, move the pick transaction into a Postgres RPC that validates turn, band quota, and golfer availability atomically.

## November 20 rehearsal — verification gates (development only)

This checklist is for the November 13 rehearsal, **not** permission to deploy or modify the live tournament. Use the isolated development environment and synthetic/test accounts only. Do not run `supabase.sql` against an existing project without a migration review; the legacy setup instructions above are not a safe production upgrade procedure.

1. **Repository and CI:** Confirm this is `blaineg04/EllenG-Cup`, the intended development branch, and the current commit. Require successful *November 20 score integrity* and *Disposable PostgreSQL acceptance contract* runs **for that commit**. Passing these does not certify live authentication or Realtime.
2. **Environment isolation:** Independently verify the target Supabase project reference and URL are nonproduction before connecting. Verify browser `config.js` uses a publishable/anon key, never a service-role key. If isolation cannot be proven, stop without writing.
3. **Two authenticated devices:** Sign in on separate browser profiles/devices as commissioner and captain; verify account IDs and captain-to-team mapping. Confirm a spectator cannot perform commissioner/captain writes. Never reuse production identities or tournament data.
4. **RSVP and roster:** With test enrollments, exercise approved, pending, declined, duplicate and out-of-directory cases. Verify the commissioner pre-draft RSVP preview is read-only, invalidates after roster changes, and never claims independent verification merely because the saved directory agrees with RSVPs.
5. **Draft synchronization:** Start a synthetic draft with at least two teams. Verify only the on-clock captain can pick, a pick appears on both devices and spectator board, duplicate or stale picks fail, timer/pause state stays consistent, and refresh/reconnect does not duplicate picks.
6. **Scoring and recovery:** On isolated test data, enter and correct scores on two devices. Verify hole totals, front/back/overall, Gator Hole points, permissions, and recovery after refresh/disconnect. Record evidence for each case.
7. **Go/no-go:** Record the tested commit SHA, isolated project reference (not credentials), test account roles, device/browser versions, CI run links, pass/fail evidence, and any unresolved issues. A failed or untested critical item is **no-go**; do not merge/deploy as part of this checklist.

**Known limitation:** GitHub Actions unit tests and disposable PostgreSQL contracts do not replace a live two-device rehearsal. Rehearsal execution requires confirmed isolated Supabase access and two authenticated sessions.
