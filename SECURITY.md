# ProofMode 3.0 — Security / Trust Boundary

The product contains two deliberately separate layers:

1. **Verified proof ledger** — `proofs` + `verifications`. This is reputation/credibility state.
2. **Entertainment/social layer** — `posts`, comments, reactions, journeys. This can contain Fail/Almost/Chaos/Reset content without being represented as verified accomplishment.

## Database hardening included
- existing v2 RLS and challenge/membership enforcement remains.
- `profiles.plan` supports `free`, internal `pro` (Proof+), `creator`, `black`; Black cannot be client-assigned.
- post publication is server/moderation-owned: authenticated clients can create/edit only unpublished pending posts.
- post ownership relationships are checked for linked proof, journey and media.
- media lifecycle/moderation metadata has no authenticated client write policy; signed-upload/finalize services own it.
- only published + moderator-approved posts can enter public feed/view RPCs.
- block pairs are enforced in feed/post visibility.
- removed comments cannot be republished by their author through a direct client update.
- reports are private to the reporter; moderation actions/job outbox have no client policy.
- `job_outbox` is service-only for moderation, media, notifications, email and cleanup retries.

## Launch blockers
See:
- `docs/TRUST_SAFETY.md`
- `docs/QA_RELEASE_CHECKLIST.md`
- `docs/MISSING_PIECES.md`

Mass public UGC launch still requires a working moderation service/queue, user-facing report/block UI, privacy/legal flows, rate limits, media validation, account deletion/export, incident response and verified app-store billing behavior.
