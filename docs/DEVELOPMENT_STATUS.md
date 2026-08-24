# ProofMode 3.0 — Development Status

**Snapshot:** 2026-08-23  
**Purpose:** Single execution checkpoint for what is actually implemented. Product strategy remains in the master plan. The GitHub control Issue mirrors this file plus live Issue/PR/CI state for zero-context recovery.

## Current state

### Implemented and verified
- Expo SDK 57 mobile app with Home / Explore / Post / Crews / You.
- Supabase migrations `001` through `008` are applied to the connected Proofmode staging project.
- The canonical launch library is enforced at exactly 60 challenge templates.
- RLS-only `SECURITY DEFINER` helpers live in the non-exposed `private` schema instead of public RPC space.
- The obsolete `join_public_challenge` RPC is removed; `join_challenge_v2` is the single join path.
- Billing synchronization is explicitly `service_role` only.
- Deterministic client table ACLs are encoded by migration `007`, matching local and hosted Supabase behavior required by the mobile client.
- Migration `008` centralizes media/post lifecycle transitions, prevents one media asset from backing multiple posts, keeps media mutation server-owned, and reuses `job_outbox` for moderation.
- Staging verification confirms the migration-008 index/functions/triggers exist and authenticated clients can read `media_assets` but cannot insert, update, or delete them.
- A rollback-only staging lifecycle smoke verified `ready → moderation_pending`, one deduplicated moderation job, and `approved → published` without leaving test data.
- Supabase security-advisor output after migration `008` is unchanged from the known intentional baseline; no new migration-008 security finding was introduced.
- A staging consistency audit found zero future-dated published rows, published/unapproved mismatches, published posts backed by unready media, media/post owner mismatches, active orphan media, deleted-media/live-post mismatches, ready-approved unpublished posts, or due background jobs.
- One mobile Supabase client with persistent AsyncStorage-backed sessions.
- One root auth/session provider with foreground/background token refresh handling.
- The plan-required email magic-link fallback is implemented with `proofmode://auth` deep-link session completion; the temporary password bootstrap is removed.
- Public Home and Explore remain readable while signed out; Post, Crews, and You require a session.
- Home reads live `get_feed_v1` with pull-to-refresh and deterministic keyset infinite scroll.
- Home renders published image and HLS video media returned by the existing feed RPC; only a visible video on the focused Home tab plays.
- Explore reads live public Drops; public Drop detail supports persisted Join and Watch/Unwatch state.
- Post/Create supports Proof, Fail, Almost, Comeback, PR, and Reset; it targets a joined public Drop and validates image/video limits before upload.
- Media upload authorization requires a joined challenge with both `visibility='public'` and `format='drop'`, and current Drop membership is rechecked before a non-finalized upload can advance through finalize.
- Selected proof media is copied into persistent app storage so interrupted uploads can be retried or discarded after app restart.
- Interrupted-upload persistence is scoped to the signed-in user; account changes reset non-persisted composer state and cannot inherit another account's retry/discard state.
- Images upload directly to Cloudflare R2 through short-lived signed PUT URLs; the backend verifies the stored object before marking it ready.
- Videos upload directly to Cloudflare Stream; signed Stream webhook handling owns processing/readiness transitions and stores HLS playback URLs.
- Retry is idempotent for provider-accepted processing/ready uploads, recoverable rows are conditionally claimed before replacement, and late Stream events cannot regress ready/deleted media.
- User discard and stale cleanup claim media state before provider deletion; provider-delete failures return media to recoverable failed/pending state instead of leaving a false deleted record.
- Abandoned pending/uploading/processing/failed media is handled by a daily server cleanup route protected by `CRON_SECRET`.
- Mobile receives only its Supabase user session and provider upload URL; Supabase service-role, R2, Stream, webhook, and cron secrets remain server-side.
- Mobile is versioned at `0.9.0` with an npm-generated SDK-57 lockfile for `expo-file-system`, `expo-image-picker`, and `expo-video`.
- CI covers foundation validation, local Supabase startup, database linting, transactional pgTAP tests, mobile locked install/typecheck, and web typecheck/build.
- The hardened v0.9 Media/Create feature head passed Foundation, Database, Mobile, and Web after the full pre-merge runtime/concurrency audit.
- Web CI is pinned to TypeScript 6.x for Next 16 compatibility; GitHub Actions use Node-24-compatible action majors.
- GitHub Issues are the durable control plane: `main` is released history, `dev` is integration, and work/bug branches are Issue-backed. Native protected branches are unavailable on the current private-repository plan, so local pre-push blocking plus server-side branch-policy audit provide the documented soft enforcement.

### Present but not fully external/device-verified
- Hosted Supabase must allow `proofmode://auth` before physical-device magic-link testing; the local Supabase config already allows it.
- Universal/App Link configuration exists; hosted association files and device-level tests are still required.
- Apple and Google sign-in still require real provider credentials/configuration and physical-device verification.
- Cloudflare R2/Stream credentials, Stream webhook registration/secret, production media delivery base URL, and `CRON_SECRET` must be configured in the deployed environment before end-to-end media validation.
- Physical-device camera/library selection and real R2/Stream upload/playback must still be exercised after those provider settings exist.
- The moderation lifecycle and queue handoff are implemented, but a real moderation worker/provider must consume `job_outbox` moderation jobs before ordinary uploaded posts automatically reach `published`.
- The root web project still lacks a lockfile and Web CI still uses `npm install`; Issue #16 tracks locking the root install, switching to `npm ci`, and resolving or documenting the exact npm audit findings.

### Known audit follow-ups before the next product phase
- Issue #15: `get_feed_v1` must explicitly exclude future-dated `published_at` rows. Staging contains none today, but the current RPC does not enforce the invariant.
- Issue #16: commit a root web lockfile, switch Web CI to locked installs, and resolve/document the exact root and mobile dependency advisories.

### Not implemented
- Reactions, comments, follows, live Crew data, report/block.
- Full Journey/proof ledger, streak/reset/comeback integration, and Passport history/metrics.
- Sharing/attribution and hosted universal-link association files.
- Push notifications/preferences.
- RevenueCat monetization.
- Sentry and PostHog production instrumentation.

## Execution order from here

1. **Close audit follow-ups #15 and #16** — feed publication-time guard plus dependency locking/security audit.
2. **Social actions** — reactions, comments, follows, Crew basics, report/block.
3. **Journey/proof integration** — proof ledger, streak/reset/comeback behavior, Passport metrics/history.
4. **Sharing and attribution** — exact-content links, hosted association files, native share, invite attribution.
5. **Push and monetization** — notification preferences/contextual push first, then RevenueCat.
6. **Closed alpha** — seed content, small real communities, activation/retention/safety/media-cost validation.

Auth provider/device configuration and Media/Create provider/device validation remain parallel release gates. They do not block safe code validation, but they must not be represented as complete until the real hosted/provider/device checks pass.

## DRY / KISS / YAGNI guardrails

- One Supabase client and one session provider. No custom auth framework.
- Domain-specific query functions only; no repository/data-access abstraction until real duplication exists.
- Keep authorization in RLS/RPC/server boundaries instead of duplicating it in clients.
- Keep internal `SECURITY DEFINER` helpers outside exposed schemas.
- Media provider credentials and publication state stay server-owned.
- Use the existing `job_outbox` before adding another queue service.
- Backend values are canonical. UI formatting stays in UI/mappers.
- Do not invent metrics the schema does not return.
- Do not silently replace failed production reads with demo data.
- Use existing Postgres/Supabase infrastructure before adding search, queues, or feed services.
- Use native share before platform posting SDKs.
- Do not add DMs, live video, ML ranking, broad contacts access, or unrelated features during MVP.
- GitHub Issues are the durable work/handoff record. Conversation context is never the only place current state may live.
