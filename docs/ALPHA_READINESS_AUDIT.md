# ProofMode 3.0 — Alpha Readiness Audit

**Audit baseline:** `dev@0ca0002ec465ed619cd421cbb03b1e72b28ff023`  
**Control Issue:** #35  
**Plan source:** ProofMode 3.0 master-plan package (`MASTER_PLAN.md`, `MVP_SPEC.md`, `TRUST_SAFETY.md`, `QA_RELEASE_CHECKLIST.md`, `IMPLEMENTATION_BACKLOG.md`, `START_HERE.md`)  
**Implementation truth:** GitHub repository/CI plus connected Supabase staging project.

This document is intentionally stricter than a feature changelog. A stage is not called complete merely because its primary screen exists. The P0 release checklist says Closed Alpha begins only after every P0 section is green.

## Status legend

- **VERIFIED** — implemented and covered by current automated/hosted verification appropriate to the component.
- **IMPLEMENTED / EXTERNAL** — implementation exists, but provider credentials, physical device, store, DNS, or another external environment gate has not been exercised.
- **PARTIAL / BLOCKER** — meaningful implementation exists, but required master-plan P0 behavior is still missing.
- **NOT STARTED** — planned stage has not been implemented.
- **DEFERRED** — explicitly P1+ or post-alpha work; not an alpha blocker unless a later requirement promotes it.

## Executive result

The accumulated `dev` branch contains a substantial, tested product core through Stage 12: schema/security foundations, the real R2/Stream media lifecycle, Create, Social Actions, Journeys/Proof Ledger/Passport, Sharing/Attribution, Notifications, and RevenueCat entitlement enforcement. Those completed slices have strong pgTAP, Foundation, CI, and hosted staging evidence.

However, **ProofMode is not yet Closed-Alpha ready under its own master plan**. The main P0 blockers are not defects in the completed Stage 8–12 work; they are incomplete earlier/future requirements that were never implemented or never externally exercised:

1. Apple/Google mobile authentication plus first-run interests/intent onboarding are missing (#36).
2. ProofTV Following/Friends, Not Interested, impression/completion instrumentation, and live Explore/template/search completion are missing (#37).
3. Sentry/PostHog runtime integration and operations alerting/dashboard evidence are missing (#38).
4. Explicit EXIF/location stripping and the planned image derivative/transform path are missing (#39).
5. Creator Studio Stage 13 is not started (#40).
6. Terms/Guidelines/age, support/contact, moderation/admin, takedown, account deletion/export, creator verification, and Black invite management are not started (#41).
7. Native iOS/Android builds and several provider/device/store flows remain external verification gates.

Issue #35 fixes concrete cross-project hardening defects that are correctly maintenance scope: legacy table privileges/policies and unbounded authenticated RevenueCat refresh traffic. It does **not** hide the product gaps above inside a maintenance PR.

# Roadmap stages 0–15

| Stage | Audit status | Evidence / remaining gap |
|---|---|---|
| 0 — Vocabulary | **IMPLEMENTED / EXTERNAL** | Canonical terms are used consistently in current code/docs. The plan's human-comprehension gate still requires real tester validation. |
| 1 — Repository/infrastructure | **PARTIAL / BLOCKER** | Next.js, Expo, shared TS domain concepts, migration workflow, locked CI, Supabase staging, and media-provider boundaries exist. Runtime Sentry/PostHog are absent. Native build and environment-separation evidence is incomplete. See #38. |
| 2 — Social data model | **VERIFIED** | Posts/Journeys/follows/watch/reactions/comments/interests/templates/blocks/reports/moderation/push/media schema exists with RLS. Database suites cover schema/auth/security plus later feature boundaries. |
| 3 — Media pipeline | **PARTIAL / BLOCKER** | Direct R2 image upload, Stream video upload/webhook, provider-state lifecycle, retry/discard/cleanup, and moderation handoff are implemented/tested. Explicit EXIF/location removal and planned image transform/derivative delivery are not implemented. Real provider/device E2E remains external. See #39. |
| 4 — Mobile shell/auth | **PARTIAL / BLOCKER** | Five tabs, persisted Supabase session, magic-link auth/recovery path, loading/error states, custom/deep links exist. Apple/Google runtime auth is missing; physical auth/link testing remains external. See #36. |
| 5 — ProofTV Feed | **PARTIAL / BLOCKER** | Real cursor pagination, append dedupe, full-screen paging, muted video, offscreen pause, reactions/comments/follow/share/report/block, and participation doorway exist. Following is presentation-only; Friends/Not Interested/impression-completion instrumentation and explicit bounded preload/failure placeholder work remain. See #37. |
| 6 — Create/post | **VERIFIED** with media-privacy dependency | Proof/Fail/Almost/Comeback/PR/Reset, joined-Drop context, camera/library, file validation, upload progress, persistent retry/discard, captions and moderation/processing states are implemented. EXIF/location is tracked separately in #39; real camera/provider E2E is external. |
| 7 — Explore/templates | **PARTIAL / BLOCKER** | Canonical 60-template database library exists and a mobile template API exists, but the live Explore screen currently loads recent public Drops, does not consume that template API, and lacks real category filtering/search/interest onboarding. See #36/#37. |
| 8 — Social | **VERIFIED** | Follow/unfollow, five reactions/unreact, comments/own-delete, report user/post/comment/Drop, block/unblock, Crew room/invite behavior and privacy are RPC-owned and pgTAP/hosted verified. Not Interested is a Feed requirement and remains #37. |
| 9 — Proof/Journey/Passport | **VERIFIED** | One-active-attempt rules, retry-safe Reset, canonical daily receipts, verification authorization, chronology/streak preservation, Journey follows/blocking, Passport derivation and reputation neutrality are tested locally/CI and hosted. |
| 10 — Sharing/acquisition | **IMPLEMENTED / EXTERNAL** | Canonical post/Receipt/Drop/Journey/profile/invite routes, share sheet/web fallback, Receipt aspect variants and 30-day non-authoritative attribution are implemented/hosted tested. Universal/App Links need real signing IDs and physical-device verification. |
| 11 — Notifications | **IMPLEMENTED / EXTERNAL** | Token/preference RPC boundaries, seven enqueue families, anti-spam/dedupe/quiet hours, delivery-time authorization, Expo worker/tickets/receipts and native tap routing are CI/hosted verified. Real APNs/FCM/EAS physical-device delivery/taps remain external. |
| 12 — Monetization | **IMPLEMENTED / EXTERNAL** | RevenueCat SDK/server/webhook/cache/restore/paywall/server entitlement mapping and Black isolation are CI/hosted verified. Real RevenueCat dashboard products, App Store/Play products, credentials and sandbox purchase/cancel/expiration/billing-issue/restore remain external. Issue #35 adds provider-call abuse control. |
| 13 — Creator Studio | **NOT STARTED** | Planned next product stage. Tracked by #40. |
| 14 — Safety/admin | **NOT STARTED / P0 BLOCKER** | Existing report/block primitives are real, but platform operations/legal/account lifecycle are not. Tracked by #41. |
| 15 — Closed alpha | **BLOCKED** | Must not start until every P0 release section below is green and external device/provider gates are exercised. |

# P0 release-gate audit

## Build / environments — PARTIAL / BLOCKER

**Verified now**
- Locked Web install/typecheck/build runs in CI.
- Mobile locked install/typecheck runs in CI.
- CI starts local Supabase, lints the database and runs transactional pgTAP.
- Server/client secret boundaries are explicitly validated for Supabase service role, Cloudflare, notification and RevenueCat secrets.
- Connected Supabase staging has forward migration history through `020_revenuecat_monetization` at this audit baseline.

**Still required**
- iOS development + TestFlight build evidence.
- Android internal build evidence.
- Explicit evidence/configuration that staging and production use separate Supabase, Cloudflare and analytics resources.
- Runtime observability/operations project wiring (#38).

## Account / onboarding — BLOCKER

**Verified now**
- Email magic-link sign-in and session persistence are implemented.
- Public Home/Explore browsing does not require an account.
- Database has unique profile handle enforcement (`profiles_handle_key`).

**Missing**
- Apple sign-in runtime.
- Google sign-in runtime.
- First-run 3–5 interests and intent flow.
- New-user populated feed/three suggested Drops experience.
- User-facing handle collision/setup flow.
- Age/Terms/Community-Guidelines acknowledgment (owned by #41).

Tracked by #36 and #41.

## ProofTV — PARTIAL / BLOCKER

**Verified now**
- Deterministic keyset cursor pagination.
- Client append dedupe prevents duplicate rows across appended pages.
- Videos are muted and only the focused visible Feed card plays.
- Block-aware server feed/RPC logic is covered by Social/Journey tests.
- Every current Feed card has a participation doorway when its Journey/Drop context exists.
- Follow, react, comment, share, report and block are real actions.

**Missing / needs explicit verification**
- Real Following mode; current label is not a mode selector.
- Friends mode when graph state supports it.
- Not Interested/mute persistence and exclusion.
- Feed impression/completion/action-after-watch analytics.
- Explicit current/next preload budget and graceful failed/processing-media placeholder behavior.

Tracked by #37.

## Create — PARTIAL only because privacy/provider gates remain

**Verified now**
- All six MVP post kinds.
- Camera and library permission request paths.
- Image/video byte and video-duration limits.
- Persistent selected media and interrupted-upload recovery.
- Retry and discard/cancel behavior.
- Reset idempotency token survives retry.
- Caption max length.
- Processing/moderation/published status messaging.
- Database/server lifecycle prevents unauthorized direct post/media mutation.

**Still required**
- Verified EXIF/exact-location removal policy (#39).
- Physical-device camera/library and real R2/Stream upload/playback verification.

## Challenges / Journeys — VERIFIED core

- Join/watch/unwatch exists; Watch Drop intentionally remains an RLS-protected direct client table path.
- Seat limits and Black/Creator capacity are database-enforced and concurrency-safe through canonical join/configuration functions.
- Private invite resolution is capability-checked and hosted tested.
- Journey timeline, Reset/new-attempt semantics, historical streak/accomplishment preservation and block-aware follows are tested.

## Social — VERIFIED core

- Follow/unfollow.
- React/unreact.
- Comment/delete own comment.
- Report user/post/comment/Drop.
- Block/unblock.
- Block enforcement is tested across feed/content/social/Journey/notification paths introduced so far.

Issue #35 removes obsolete write policies left behind after these mutations became RPC-owned.

## Sharing / attribution — IMPLEMENTED / EXTERNAL

**Verified now**
- One canonical HTTPS content contract for post/Receipt/Drop/Journey/profile/invite.
- Useful no-login web fallbacks.
- Native OS share-sheet implementation and web Web Share/clipboard fallback.
- Receipt variants 9:16, 4:5 and 1:1.
- Attribution persistence across auth return and canonical invite claiming.

**External**
- iOS Universal Links on a signed physical build.
- Android App Links on a signed physical build.
- Real target-app share tests (Messages/Instagram/TikTok/Snapchat/copy link).

## Notifications — IMPLEMENTED / EXTERNAL

**Verified now**
- Permission is not requested on cold launch; explicit enable action owns prompt.
- Canonical destination allowlist and tap routing.
- Independent preference controls.
- Stable event dedupe.
- Hourly/daily budget and quiet hours.
- Delivery-time visibility/block authorization.
- Expo ticket/receipt retry and invalid-token cleanup.

**External**
- APNs/FCM/EAS credentials and physical iOS/Android push delivery/tap tests.

## Payments — IMPLEMENTED / EXTERNAL

**Verified now**
- RevenueCat entitlement mapping to internal Proof+/Creator plans.
- Black cannot be provider-assigned or downgraded by provider state.
- Proof+/Creator do not alter Proof Score/verification.
- Creator/Black capacity is server/database-enforced.
- Restore/purchase SDK flows and server refresh path exist.
- Webhook signature/auth and delayed-event/idempotency behavior are tested.
- Issue #35 adds a durable service-only refresh lease before outbound RevenueCat refresh calls.

**External**
- Real App Store/Play/RevenueCat product mapping.
- Sandbox purchase, cancel, expiration, billing issue and restore lifecycle.

## Safety — BLOCKER

**Already real**
- User/post/comment/Drop reporting taxonomy.
- Block/unblock.
- Restricted challenge text check for obvious dangerous deprivation/self-harm/extreme rapid weight-loss patterns.
- Database report/moderation schema primitives.

**Missing before alpha**
- Community Guidelines live flow.
- Terms/privacy/support/contact live flow and acceptance records.
- Declared age/acknowledgment before posting.
- Moderator queue/dashboard and operator authorization.
- Strike/action history, bans/suspensions and emergency takedown path.
- Operational routing for dangerous/self-harm/harassment/sexual/minor-related reports.
- Account deletion, content deletion and data export.
- Creator verification and Black invite management.

Tracked by #41.

## Observability — BLOCKER

The environment templates name Sentry and PostHog, but repository search and dependency manifests show no runtime Sentry/PostHog integration. Environment variables alone do not satisfy this gate.

Tracked by #38:
- Sentry/error alerts.
- PostHog activation/retention events.
- Cloudflare media spend alerts.
- Supabase DB/storage/egress alerts.
- Vercel usage alerts.
- RevenueCat webhook failure visibility.
- Feed latency and publish-success dashboards.

# Database/security hardening findings

## Verified baseline

- Every current `public` base table on staging has RLS enabled.
- Public feature RPCs introduced by the recent slices use narrow `SECURITY INVOKER` entrypoints over explicitly granted privileged implementations where privilege bypass is required.
- Social/Journey/Post/verification/token/notification/billing mutations already moved behind server/RPC boundaries are denied direct client DML by later migrations.
- Staging security advisor currently reports only INFO `rls_enabled_no_policy` notices for intentionally service/RPC-only operational tables such as `billing_events`, `job_outbox`, `moderation_actions`, `push_tokens`, `notification_preferences` and `push_deliveries`; no new exposed public `SECURITY DEFINER` blocker was found.

## Finding A — inherited table privileges

Live staging grant inspection found many exposed tables still carried PostgreSQL ownership-like client grants such as `TRUNCATE`, `REFERENCES` and `TRIGGER`; several older tables also retained broad DML grants whose RLS happened to block unsupported operations. Those privileges are not required by the current Data API/mobile contracts.

**Issue #35 remediation:** migration `021_alpha_readiness_hardening.sql` revokes `TRUNCATE/REFERENCES/TRIGGER` across all public tables, narrows older table grants to current intentional operations, and sets safer default privileges for future tables. This is not considered verified until exact-head CI and hosted staging checks pass.

## Finding B — stale RLS write policies

Social/Journey credibility mutations became RPC-owned, but older INSERT/UPDATE/DELETE policies remained on comments, Crew messages, follows, invites, Journeys, reactions, proofs, reports, verifications and profile mutation. They did not currently grant writes when table privileges were revoked, but they obscured the true boundary and generated avoidable advisor noise.

**Issue #35 remediation:** migration 021 removes obsolete mutation policies and replaces the old Blocks `ALL` policy with caller-only SELECT.

## Finding C — authenticated RevenueCat refresh amplification

`POST /api/billing/refresh` authenticated the caller, then contacted RevenueCat before any durable request-frequency guard. Provider-event idempotency prevented duplicate state mutation but did not prevent repeated external API traffic.

**Issue #35 remediation:** reuse the existing service-only `billing_events` table as an atomic per-user 60-second refresh lease. The server must claim the lease through a service-role-only RPC **before** `fetchRevenueCatSnapshot()`; immediate repeats return HTTP 429 with `Retry-After`. No Redis/new rate-limit vendor or parallel billing ledger is introduced.

## Performance advisor disposition

Current staging also reports legacy INFO/WARN items including unindexed foreign keys, auth-function init-plan notices on retained early RLS policies, and fresh/unused indexes. These are documented technical debt, not proof that a completed feature is functionally incorrect. Issue #35 removes several init-plan warnings indirectly by deleting stale policies. Remaining indexes/policies should be changed only when query patterns or alpha measurements justify them; DRY/KISS/YAGNI takes precedence over mechanically indexing every foreign key.

# External verification matrix

| Gate | Code exists? | External evidence still needed |
|---|---|---|
| iOS dev/TestFlight build | Mobile project exists | Signed build succeeds on current Apple configuration. |
| Android internal build | Mobile project exists | Signed/internal build succeeds on current Google configuration. |
| Apple sign-in | **No** | Implement in #36, then provider credentials + physical test. |
| Google sign-in | **No** | Implement in #36, then provider credentials + physical test. |
| Magic-link device auth | Yes | Hosted redirect allowlist + physical-device round trip. |
| Universal Links | Yes | Real Apple Team ID, signed build, fresh-install/device test. |
| Android App Links | Yes | Real signing SHA-256, signed build, device test. |
| R2/Stream upload/playback | Yes | Real credentials/webhook + physical camera/library E2E. |
| Push notifications | Yes | APNs/FCM/EAS credentials + real delivery/tap tests. |
| RevenueCat purchases | Yes | Dashboard/store products + sandbox lifecycle tests. |
| Sentry/PostHog | **No runtime integration** | Implement #38, then real project/alert/event smoke. |
| Cloudflare/Supabase/Vercel spend/health alerts | Partial docs/env | Configure destinations/thresholds and exercise alerts (#38). |

# Automated verification inventory

At baseline `dev@0ca0002e...`, database suites are present through:

1. schema/auth
2. RLS
3. security hardening
4. media lifecycle
5. Social Actions
6. Journey/Proof/Passport
7. cross-layer integration hardening
8. Sharing/Attribution
9. Notifications MVP
10. Notifications hardening
11. RevenueCat monetization

Issue #35 adds `012_alpha_readiness_hardening.test.sql` and a dedicated Foundation validator. The hardening change is only complete after that exact head passes Foundation, local Supabase startup/lint/all pgTAP, Mobile locked install/typecheck, Web locked install/typecheck/build, and then hosted staging verification/advisors.

# Next execution order

1. **Finish Issue #35** — exact-head CI → apply migration 021 to staging → hosted ACL/policy/refresh-lease smoke → advisors → zero residue → review/control → merge to `dev`.
2. **#36 Mobile onboarding/provider auth** — fixes the largest earlier-stage account/onboarding P0 hole.
3. **#37 ProofTV/Explore completion** — makes feed modes/Not Interested/instrumentation/live templates/search real.
4. **#38 Observability/operations** and **#39 media privacy** — required P0 operational/privacy gates; can proceed independently when branch coordination permits.
5. **#40 Stage 13 Creator Studio** — next numbered product stage, without absorbing unresolved platform P0 work.
6. **#41 Stage 14 Safety/admin/account lifecycle** — mandatory before external alpha users.
7. Run the complete P0 QA checklist on signed staging builds with real provider/store credentials.
8. **Only then begin Stage 15 Closed Alpha.** Do not treat accumulated release-ready code or a green server CI run as equivalent to this gate.

# Scope conclusion

The project is still aligned with the master plan at the architectural level: recent stages reuse the canonical tables/RPCs/queues, reputation remains server-derived, provider entitlements do not rewrite credibility, and the social/Journey/notification layers compose rather than fork state. The main drift is **execution-order completeness**: several early P0 onboarding/observability/feed/explore/privacy requirements remain unfinished while Stages 8–12 advanced. The corrective plan above closes those gaps explicitly instead of rewriting the verified core or pretending external/device gates are complete.
