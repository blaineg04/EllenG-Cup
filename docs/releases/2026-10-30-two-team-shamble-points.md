# Two-team 18-hole shamble points release — 2026-10-30

Production source ac5a5caf31540c067ec8c26532e16a56b9eb74fe.
Native acceptance run https://github.com/blaineg04/EllenG-Cup/actions/runs/41149652477 completed success.
483 root regressions passed, native PostgreSQL install/own score save/edit/clear across all18/permission denial/concurrency passed, full browser tests for commissioner/captain/player at390/1440 passed.
Pure full-round test: 60 golfers ×18 holes=1080 records, two teams1620points each for all pars, all18complete. Paginated exact-count reads handle more than1000 rows.

Rules: shamble_points; two flexible rosters, gross individual strokes for all18; eagle or better5,birdie4,par3,bogey2,double1,triple or worse0. Every golfer contributes; no normalization for uneven teams. Team hole complete only when every rostered golfer has valid strokes; a saved zero-point result counts as entered, missing score does not. Legacy Standard and Split-Pair preserved.

Supabase migration elleng_two_team_shamble_points applied. Function metadata confirmed points support, authenticated execute and denied anonymous execute; no direct table-write grants added.
Live elleng-cup-live configured in locked preflight transaction only after verifying setup, zero all score types/picks/assignments: team_count2, draft teams2, format shamble_points. All35golfer records and35login links preserved; no team assignments invented.
Vercel READY and shamble-points.js HTTP200 verified.

Limitations: archive-and-start-new deliberately blocked in this format until individual score archival is implemented and verified. Existing individual scores must not be discarded through legacy team-only archive. Existing backup/alert operational work is separate. Hosted authenticated positive save on this newly enabled format was not exercised with a real golfer session in this release; native JWT-role and browser SDK fixture tests cover the implementation.
