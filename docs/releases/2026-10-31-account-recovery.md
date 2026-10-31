# Verified golfer recovery email

Existing username aliases, player links, profiles, assignments and scores stay unchanged. A linked golfer adds a separately verified recovery email from My Golf after entering the current account password. Until confirmation succeeds, the old verified address remains active. Forgot password accepts the verified address and sends a native Supabase Auth recovery link to that address. The password update uses a temporary in-memory recovery session.

## Delivery setup still required

The feature fails closed unless all three Supabase Edge Function secrets exist:

- `ELLENG_BREVO_API_KEY`: Brevo transactional API key, entered directly into Supabase Secrets by the account owner.
- `ELLENG_RECOVERY_FROM_EMAIL`: sender email registered and verified in Brevo.
- `ELLENG_RECOVERY_ENABLED`: set to `true` only when the sender and delivery test are ready.

No provider account, sender, key or paid resource is provisioned by this code. Never put a key or password in chat, GitHub or frontend configuration. Brevo must approve transactional sending and the sender before enabling. Disable click/open tracking for recovery mail. The app explicitly asks the user to continue before consuming an email link, and removes the fragment from the address bar.

## Security and validation

Private RLS tables and service-only invoker RPCs; 256-bit verification tokens stored only as SHA-256 digests; 30-minute single-use confirmation; unique verified address; current-password reauthentication and server-validated user ID; generic public reset replies; recipient 1/minute and 5/hour, global 200 deliveries/day. Reauthentication ends only its temporary session. The native Auth recovery token lifetime follows project Auth settings. Email contents contain no scores or profile data. No authorization reads user-editable metadata.

Acceptance: focused Node handler tests, disposable socket-only native PostgreSQL permission/concurrency tests, and Playwright mobile/desktop recovery flows. Real inbox delivery and actual native Auth recovery remain an explicit activation gate; mocks do not prove delivery. No live golfer password or recovery address is changed by tests. Hourly development runs remain paused.

If a golfer has no verified email or loses email access, commissioner Update / Reset remains the recovery fallback. Reused/shared household recovery addresses cannot be attached to multiple golfer accounts.
