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
