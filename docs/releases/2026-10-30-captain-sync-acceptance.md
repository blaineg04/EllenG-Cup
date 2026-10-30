# Hosted captain pick and sync acceptance — 2026-10-30

Test source: ca82eea31740213696740eb4fb5dfc0c3f5afa9a. Exact production captain/viewer logic with only isolated draft configuration.
Authenticated Team 1 captain submitted golfer index 0 through the UI and confirmed the pick.
Second viewer tab was open before submission and updated without reload: Team 1 roster contains golfer 0, draft log entry 1, turn changed to Team 2.
Captain controls became disabled Waiting for Team 2.
Captain reload restored authenticated session, saved roster and turn lock.
Database readback: synthetic picks length 1, team 1 roster [0], golfer 0 team 0. Live elleng-cup picks length 0 and roster [].

Scope: two browser tabs sharing one browser profile, not two physical devices. No Team 2 authenticated pick or offline test in this acceptance.
Cleanup: paused/archived synthetic draft elleng-captain-sync-test-20261030, removed only its temporary captain assignment, retired both acceptance pages. Live captain assignments untouched.

Prior closeout: central diagnostics installed and commissioner read verified; authenticated RSVP Playing/reload/Maybe/clear passed with original zero attendance restored.
Only credential rotation confirmation remains outside these functional acceptance checks.
