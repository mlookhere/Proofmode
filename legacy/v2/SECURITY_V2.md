# Security & launch-hardening notes

## Included now

- Row Level Security on user-facing Supabase tables.
- Billing-owned `profiles.plan` is not writable by the authenticated browser role; only safe profile columns are client-editable.
- Free challenge quota, private-challenge eligibility, and plan seat caps are enforced in database policies as well as API routes.
- Direct membership inserts are disabled after migration 002; invite/public joins must use the locked `join_challenge_v2` RPC, which serializes joins per challenge to prevent seat-cap races.
- Security-definer helpers use an empty `search_path` and fully qualified table references.
- Private proof media is stored in a non-public bucket.
- Media delivery first authorizes the proof through RLS, then creates a short-lived signed URL with the server-only service role.
- Proof uploads are server-validated to JPG/PNG/WebP and 10MB.
- Challenge membership is checked server-side before proof upload.
- One proof per user/challenge/date is enforced at the database layer.
- Self-verification is blocked; verifier uniqueness is enforced by primary key.
- Invite creation is membership/ownership-gated in both API logic and the 2.0 RLS policy.
- Invite claims are unique per referred user + challenge and cannot self-refer.
- Private/crew invite landing RPC returns only safe challenge metadata when a valid invite capability is supplied.
- Public leaderboard/Profile RPCs expose aggregate/public identity only, not storage paths or private activity.
- Dangerous deprivation/self-harm/extreme rapid-weight-loss phrases are rejected at challenge creation as a first safety layer.
- Stripe webhook validates timestamped HMAC signatures; event claiming, subscription upsert, effective-plan recomputation, and activation analytics run in one service-role-only Postgres transaction for retry-safe idempotency.
- Paid members have Stripe Customer Portal self-service.
- Stripe server calls are pinned to API version `2026-06-24.dahlia`; production should prefer a restricted `rk_` key.

## Required before mass public launch

- Edge/WAF rate limits for auth, analytics, public snapshot RPCs, media signing, and state-changing endpoints.
- CSRF/origin enforcement for cookie-authenticated JSON endpoints.
- EXIF stripping before proof files are retained.
- Image/content moderation plus a moderator review queue.
- User-facing report/block/remove flows.
- Stronger semantic challenge safety moderation beyond keyword matching.
- Creator moderator roles and audit logs.
- Malware/MIME sniffing independent of browser-declared MIME type.
- Account export and deletion flows, retention policy, and backup/restore drills.
- Observability, exception alerts, auth anomaly monitoring, and database capacity alerts.
- Transactional email abuse controls and unsubscribe handling if lifecycle email is added.
- Privacy review for any future creator CRM/export capability; require explicit participant opt-in.
- Terms, Privacy, Community Rules, DMCA/reporting process as applicable, and age-policy review.
- Webhook replay runbook and billing reconciliation job.

## Deliberately not included yet

- Paid participant entry / creator payouts. This should use Stripe Connect and adds onboarding, KYC, tax, refunds/disputes, platform-liability, and marketplace-security considerations. Do not fake this with ordinary PaymentIntents or direct transfers.
- Automated health/medical challenge judgment.
- Streak freezes or purchasable streak protection.
