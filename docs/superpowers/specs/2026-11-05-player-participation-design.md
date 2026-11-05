# Player participation

Approved by the user: new golfers default to Not playing; commissioner can choose Playing on creation or change existing golfers. Both states retain login, photo and directory visibility. Not playing excludes the golfer from draft and scoring. Never remove or reindex a golfer to change attendance. Block status changes after picks, assignments or scores exist, and during live/completed play. Existing account-only golfers must be promotable without creating another account.

Approach: retain existing participating boolean and stable golfer_index, add a small status control and commissioner-only atomic database operation. Reusing Remove would reindex golfers and was rejected. RSVP alone does not control draft membership. Build only in a development branch; production and live data stay unchanged pending verification and preview.

User-approved extension: Players header shows Total golfers in app, including playing, excluded and account-only golfers without double-counting linked accounts. Search does not change the app total. If account directory retrieval fails, show total temporarily unavailable rather than a partial total. Reuse the existing subtitle line to preserve mobile spacing.
