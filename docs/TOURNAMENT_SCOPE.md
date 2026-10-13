# EllenG Cup — tournament-only scope

EllenG Cup is a private, themed work golf tournament website. It is **not** intended for app-store release, public SaaS onboarding, subscription billing, or commercial multi-tenant use.

## Must work on tournament day
- Mobile web entry, clear navigation, and participant access.
- Commissioner setup, participant roster, RSVP, handicaps, captain assignment, and safe resets.
- Standard/snake captain draft, synchronized turn clock, eligibility, auto-pick, and standings.
- Front-nine scramble and back-nine shamble scoring; Gator Hole double points, ties, and Final Cargo.
- Real-time scores and leaderboard, persistence after refresh, and recovery from intermittent connectivity.
- Familiar EllenG Cup theme and work-tournament branding.

## Out of scope
- App Store / Play Store submissions and installation flows.
- Subscription billing, public marketplace, monetization, and generic tournament builder.
- FairwayOS code, data, infrastructure, and branding.

## Engineering safeguards
- Development changes only on `development/*` branches until approved.
- Never modify live tournament data or production deployment without permission.
- Use isolated fixtures for destructive/reset tests.
- Any GitHub Actions job must target the verified MacBook self-hosted runner.
- Prefer small, testable changes over major rewrites ahead of tournament day.
