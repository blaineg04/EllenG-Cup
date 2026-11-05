# Player participation

Approved by the user: new golfers default to Not playing; commissioner can choose Playing on creation or change existing golfers. Both states retain login, photo and directory visibility. Not playing excludes the golfer from draft and scoring. Never remove or reindex a golfer to change attendance. Block status changes after picks, assignments or scores exist, and during live/completed play. Existing account-only golfers must be promotable without creating another account.

Approach: retain existing participating boolean and stable golfer_index, add a small status control and commissioner-only atomic database operation. Reusing Remove would reindex golfers and was rejected. RSVP alone does not control draft membership. Build only in a development branch; production and live data stay unchanged pending verification and preview.
