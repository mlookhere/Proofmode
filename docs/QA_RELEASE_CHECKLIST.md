# ProofMode — MVP Release Gate

A feature being “done” does not mean the product is ready to invite real users. Alpha starts only when every P0 section below is green.

## Build / environments
- [ ] Web production build succeeds from lockfile.
- [ ] iOS development + TestFlight build succeeds.
- [ ] Android internal build succeeds.
- [ ] Staging and production use separate Supabase/Cloudflare/analytics resources.
- [ ] CI runs typecheck, tests, migration lint/smoke and web build.
- [ ] Secrets are server-side / secret-store only.

## Account / onboarding
- [ ] Apple and Google sign-in tested on physical devices.
- [ ] Email recovery works.
- [ ] Username collisions handled.
- [ ] Age/terms/community-guidelines acknowledgment recorded.
- [ ] New user can select interests and get a populated feed without following anyone.

## ProofTV
- [ ] Cursor pagination.
- [ ] No duplicate posts in a session page.
- [ ] Video does not autoplay audibly.
- [ ] Media preloading is bounded.
- [ ] Failed/processing media has graceful placeholder.
- [ ] Blocked accounts never appear.
- [ ] Removed posts disappear quickly.
- [ ] Every feed post has an action doorway.

## Create
- [ ] Proof / Fail / Almost / Comeback / PR / Reset.
- [ ] Camera + library permissions have useful denied states.
- [ ] Upload can resume/retry.
- [ ] User can cancel/delete draft.
- [ ] EXIF/location handling matches privacy policy.
- [ ] Captions are length-limited.
- [ ] Content enters moderation state before public distribution when required.

## Challenges / Journeys
- [ ] Join/watch/unwatch.
- [ ] Seat cap is race-safe in DB.
- [ ] Private invite cannot leak private challenge data.
- [ ] Basic Journey timeline works.
- [ ] Broken streak preserves historical accomplishment.
- [ ] Reset starts a new attempt rather than rewriting history.

## Social
- [ ] Follow/unfollow.
- [ ] React/unreact.
- [ ] Comment/delete own comment.
- [ ] Report user/post/comment/Drop.
- [ ] Block/unblock.
- [ ] Block is enforced in feed, profile, comments and notifications.

## Sharing / attribution
- [ ] One canonical HTTPS URL per post/receipt/challenge/profile.
- [ ] iOS Universal Links verified on device.
- [ ] Android App Links verified on device.
- [ ] Website fallback useful without login.
- [ ] Native share sheet works to Messages, Instagram, TikTok, Snapchat and copy link without platform-specific APIs.
- [ ] Referral attribution survives install/auth return.

## Notifications
- [ ] Push permission is requested contextually, not first launch.
- [ ] Deep link opens exact content.
- [ ] Preference controls work.
- [ ] Dedupe works.
- [ ] Non-transactional default budget enforced.
- [ ] Quiet hours/time-zone behavior tested.

## Payments
- [ ] Products match App Store / Play / web configuration.
- [ ] RevenueCat entitlement mapping tested sandbox → backend cache.
- [ ] Purchase, cancel, expiration, billing issue, restore all tested.
- [ ] Proof+ never changes Proof Score/verification.
- [ ] Creator limits enforced server-side.
- [ ] Black cannot be self-assigned.

## Safety
- [ ] Community Guidelines live.
- [ ] Terms/privacy/support/contact flows live.
- [ ] Moderator queue tested.
- [ ] Emergency takedown path documented.
- [ ] Dangerous/self-harm/harassment/sexual/minor-related reporting categories routed correctly.
- [ ] Account deletion + content deletion/export flow tested.

## Observability
- [ ] Sentry/error alerts.
- [ ] PostHog activation and retention events.
- [ ] Cloudflare media spend alerts.
- [ ] Supabase DB/storage/egress alerts.
- [ ] Vercel usage alerts.
- [ ] RevenueCat webhook failures visible.
- [ ] Feed latency and publish-success dashboards.

## Alpha success gate before broader creator seeding
Use a cohort large enough to observe repeated behavior. Do not scale acquisition until:
- users understand the product without founder explanation,
- meaningful first participation occurs in the first session/day,
- people voluntarily share/challenge friends,
- at least a subset returns to watch when they have nothing to post,
- report/block/moderation can be operated reliably,
- media cost per active participant is understood.
