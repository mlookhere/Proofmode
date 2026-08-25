# Stage 11 — Notifications checkpoint

Stage 11 extends the existing ProofMode notification state (`push_tokens`, `notification_preferences`, and `job_outbox(kind='push')`) rather than introducing a parallel queue or preference system.

## Implemented

- Supabase migrations `018_notifications_mvp` and `019_notifications_hardening`.
- RPC-owned Expo token registration/disable and notification preferences.
- Service-only push delivery state and Expo Push Service ticket/receipt processing.
- Account-scoped token ownership, invalid-token cleanup, stable dedupe, quiet hours, block/self suppression, and frequency budgets.
- Delivery-time canonical route/content visibility reauthorization.
- Direct social, invite accepted, Drop start/end, Journey continuation, streak-risk, and Crew-position event families.
- Recipient-local dates for time-sensitive stake notifications.
- Expo SDK 57 `expo-notifications ~57.0.14` with generated npm lockfile.
- Explicit mobile permission opt-in; cold startup never requests notification permission.
- Token refresh, logout cleanup/native unregister fallback, canonical foreground/cold-start tap routing, six independent preference switches, and quiet hours.
- 34 Stage 11 pgTAP assertions, 15 hardening assertions, and dedicated Foundation notification validation.
- Recap remains P1/off and is not exposed in the Stage 11 client.

## Verified before this checkpoint

- Code head `7318dd1fd9a51f97d5893b62ceab47f1dd636f4b` passed ProofMode CI #146 across Foundation, Database startup/lint/all pgTAP, Mobile locked install/typecheck, and Web locked install/typecheck/build.
- Staging contains migrations `018` and `019` after `017`.
- Hosted ACL checks confirm clients have no direct token/preference/delivery table access and public notification RPCs are invoker wrappers over private privileged implementations.
- Hosted rollback-only behavior verified active-token theft prevention, transfer after explicit disable, stable follow/reaction dedupe, delivery-time suppression of removed content, and recipient-local streak-risk dates with zero fixture residue.
- Post-migration advisors show no Stage 11 correctness blocker or unindexed Stage 11 foreign key.

## External verification gates

The repository does not claim physical-device push delivery yet. Real APNs/FCM credentials, EAS native project configuration, Expo Push Service delivery to physical iOS/Android devices, and real notification-tap behavior must be exercised in a configured development/release build. Expo Go remote-push validation is not claimed.

This checkpoint intentionally changes documentation only. The Stage 11 database and application implementation verified above is unchanged; the new documentation head must still pass the normal exact-head CI and PR-control gates before merge.
