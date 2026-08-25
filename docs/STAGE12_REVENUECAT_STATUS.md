# Stage 12 — RevenueCat Monetization Status

**Checkpoint:** 2026-08-25  
**Controlling Issue:** #33  
**PR:** #34  
**Baseline:** `dev@d5bdd352a8319cd08c3fb480d8afecc1f956fb50`

## Implemented

- RevenueCat is the canonical entitlement source for new native and web purchases while existing direct Stripe subscriptions remain a compatibility source.
- The existing `profiles.plan`, `subscriptions`, and `billing_events` model is reused; no parallel plan/entitlement ledger was introduced.
- Canonical provider entitlements are `proof_plus` and `creator`. ProofMode Black remains server-owned/invitation-only and cannot be granted by RevenueCat payloads or public purchase surfaces.
- Effective entitlement inheritance is `black => creator => proof_plus`; the legacy internal `pro` value remains the Proof+ compatibility representation.
- RevenueCat webhook handling authenticates the raw request using configured Authorization plus HMAC-SHA256/timestamp verification before parsing, then refreshes authoritative Customer Info server-side before database mutation.
- New web Proof+/Creator checkout uses identified HTTPS RevenueCat Web Purchase Links and fails closed unless the configured host is `pay.rev.cat`.
- Mobile uses `react-native-purchases@10.7.2`, configures only with the signed-in Supabase UUID, switches identified accounts directly with `logIn`, and deliberately never calls RevenueCat `logOut()` so an anonymous identity is not created between ProofMode sessions.
- Purchase, restore, server refresh, caller-only entitlement reads, localized Offering prices, management links, native Membership UI, Passport entry, and legacy Stripe management compatibility are implemented.
- Paid state does not alter Proof Score, verification, streak history, invite credit, earned badges, or ranking.

## Exact-head CI

Head `200752af96ca991ee1eb23a8febf1ccaa4f6d2e0` passed ProofMode CI #155:

- Foundation: passed
- Database startup, lint, and all pgTAP: passed
- Mobile locked install and typecheck: passed
- Web locked install, typecheck, and production build: passed

The first consolidated CI run exposed and led to fixes for a case-sensitive pricing validator and missing `service_role` usage on the non-exposed `private` schema. Subsequent hardening removed RevenueCat anonymous-ID creation on logout and added strict RevenueCat Web Purchase Link validation.

## Hosted staging verification

Migration `020_revenuecat_monetization` is applied after `019_notifications_hardening` in the connected ProofMode staging project.

Structural verification confirms:

- `public.sync_revenuecat_entitlements_v1` and `public.get_my_entitlements_v1` are `SECURITY INVOKER` wrappers.
- Privileged RevenueCat implementations remain `SECURITY DEFINER` in the non-exposed `private` schema.
- RevenueCat sync is executable only by `service_role`; caller entitlement reads are authenticated/self-scoped.
- `service_role` has the required `private` schema usage for the invoker-to-private call chain.
- Provider constraints allow only Stripe/RevenueCat, RevenueCat entitlements only Proof+/Creator, and Black is absent from provider-grantable state.
- Client INSERT/UPDATE/DELETE on `subscriptions` is revoked.

A rollback-only hosted behavior smoke passed fail-fast checks for:

- authenticated entitlement-forge denial;
- authenticated subscription-update denial;
- Proof+ -> internal `pro` mapping;
- Creator precedence;
- duplicate RevenueCat event idempotency;
- delayed/stale event suppression;
- provider inability to grant Black;
- RevenueCat inability to downgrade server-owned Black;
- Black inheritance of Proof+/Creator and Creator-scale challenge capacity;
- legacy Stripe + RevenueCat coexistence and Stripe fallback after RevenueCat expiration.

Rollback residue is zero for fixture users, profiles, subscriptions, billing events, and analytics rows.

## Advisors

Post-020 Supabase security advisors report no new Stage 12 correctness/security blocker. Remaining INFO notices are the established RLS-enabled/no-policy pattern on service/RPC-owned operational tables.

Performance advisors report inherited unindexed-FK and auth-initplan findings plus fresh/legacy unused-index information; no new unindexed foreign key was introduced by Stage 12.

Reference remediation pages:

- RLS enabled/no policy: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Unindexed foreign keys: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys
- Auth RLS initialization plans: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

## External verification gates

The following are intentionally not claimed as verified until real provider/store configuration exists:

- RevenueCat project products, Offerings, entitlements, webhook secret, API key, and production/sandbox Web Purchase Links;
- App Store and Google Play products;
- sandbox purchase, renewal, billing issue, cancel/expiration, refund, restore, and management flows;
- physical-device iOS/Android purchase/restore behavior;
- taxes/refunds/store-console operational setup.

## Immediate hardening follow-up

The project-wide hardening pass immediately after Stage 12 should address two inherited/operational boundaries without expanding Stage 12 scope:

1. Reduce inherited non-DML table privileges (`TRUNCATE`, `REFERENCES`, `TRIGGER`) on `public.subscriptions` to the minimum caller contract through a forward migration, preserving only authenticated self-read plus service ownership.
2. Add durable per-user abuse control/deduplication for `/api/billing/refresh` so an authenticated client cannot generate unbounded RevenueCat REST traffic and unique refresh billing-event rows.

These are defense-in-depth/operational hardening items; current standard client Data API writes to billing state remain denied.

## Merge gate

Keep PR #34 unmerged until this documentation head passes the normal exact-head CI and PR metadata/control gate, review state remains clear, and the expected-head merge guard succeeds. After merge, verify the `dev` branch-policy audit and move Issue #33 to `state:release-ready` before beginning the project-wide hardening Issue.
