# ProofMode 3.0 — Development Status

**Snapshot:** 2026-08-23  
**Purpose:** Single execution checkpoint for what is actually implemented. Product strategy remains in the master plan. The GitHub control Issue mirrors this file plus live Issue/PR/CI state for zero-context recovery.

## Current state

### Implemented and verified
- Expo SDK 57 mobile app with Home / Explore / Post / Crews / You.
- Supabase migrations `001` through `009` are applied to the connected Proofmode staging project.
- The canonical launch library is enforced at exactly 60 challenge templates.
- RLS-only `SECURITY DEFINER` helpers live in the non-exposed `private` schema instead of public RPC space.
- The obsolete `join_public_challenge` RPC is removed; `join_challenge_v2` is the single join path.
- Billing synchronization is explicitly `service_role` only.
- Deterministic client table ACLs are encoded by migration `007`, matching local and hosted Supabase behavior required by the mobile client.
- Migration `008` centralizes media/post lifecycle transitions, prevents one media asset from backing multiple posts, keeps media mutation server-owned, and reuses `job_outbox` for moderation.
- Staging verification confirms the migration-008 index/functions/triggers exist and authenticated clients can read `media_assets` but cannot insert, update, or delete them.
- A rollback-only staging lifecycle smoke verified `ready → moderation_pending`, one deduplicated moderation job, and `approved → published` without leaving test data.
- Supabase security-advisor output after the media/feed migrations is unchanged from the known intentional baseline.
- Migration `009` explicitly excludes future-dated `published_at` rows from `get_feed_v1` without changing deterministic score or keyset ordering; rollback-only staging verification returned zero future rows and left no test data.
- A staging consistency audit found zero published/unapproved mismatches, published posts backed by unready media, media/post owner mismatches, active orphan media, deleted-media/live-post mismatches, ready-approved unpublished posts, or due background jobs.
- One mobile Supabase client with persistent AsyncStorage-backed sessions.
- One root auth/session provider with foreground/background token refresh handling.
- The plan-required email magic-link fallback is implemented with `proofmode://auth` deep-link session completion; the temporary password bootstrap is removed.
- Public Home and Explore remain readable while signed out; Post, Crews, and You require a session.
- Home reads live `get_feed_v1` with pull-to-refresh and deterministic keyset infinite scroll.
- Home renders published image and HLS video media returned by the feed RPC; only a visible video on the focused Home tab plays.
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
- Root web dependencies are reproducibly locked with npm lockfile version 3; Web CI uses `npm ci --ignore-scripts` with cache keyed from `package-lock.json`.
- Root `next` is patched from `16.2.11` to `16.3.2`; the resulting lock resolves `postcss@8.5.23` and `sharp@0.35.3`, and both full and production-only root npm audits report zero vulnerabilities.
- Next `16.3.2` passes ProofMode Web typecheck and production build with the existing `typescript@6.0.3` compatibility pin.
- The mobile npm audit reports zero high/critical findings and 10 moderate findings in the Expo SDK-57 tooling graph. The concrete vulnerable chain is `expo@57.0.15 → @expo/config-plugins@57.0.8 → xcode@3.0.1 → uuid@7.0.3`; npm provides no safe SDK-57-compatible aggregate remediation, so no forced Expo rollback or unsupported uuid override is used.
- Foundation validation covers migration contracts, media/runtime hardening, root package/lock parity, dependency security floors, TypeScript compatibility, and locked Web CI.
- CI covers foundation validation, local Supabase startup, database linting, transactional pgTAP tests, mobile locked install/typecheck, and web locked install/typecheck/build.
- GitHub Issues are the durable control plane: `main` is released history, `dev` is integration, and work/bug branches are Issue-backed. Native protected branches are unavailable on the current private-repository plan, so local pre-push blocking plus server-side branch-policy audit provide the documented soft enforcement.

### Implemented on Social Actions branch; verification pending
- Issue #21 is active on `work/21-social-actions`, based directly on the released `dev` integration state.
- Forward migrations `010` through `013` add the Social Actions contract without rewriting applied migrations: RPC-owned follows/reactions/comments/block/report mutations, block-aware reads and aggregate privacy, Crew room messages/read models, invite creation, feed viewer relationship state, caller-only blocked-user listing, and a private-schema boundary for newly introduced privileged implementations.
- Public Social Actions RPC names remain stable, but their public functions are `SECURITY INVOKER` wrappers; the 13 privileged implementations live in the non-exposed `private` schema with explicit role grants.
- Blocking atomically removes both directional follow edges; blocked pairs cannot newly follow/react/comment through the social RPCs, and blocked users are filtered from exposed feed/comment/profile/Crew reads and social aggregates.
- Home is wired to real follow/unfollow, the five canonical reactions, text comments, own-comment deletion, post/comment/user reporting, and block behavior. Signed-out users may read public content/comments but are routed to authentication before persisted interaction.
- Public Drop detail includes report submission through the same reason taxonomy.
- Crews reuses `challenges`, `challenge_members`, proofs/posts, and invites as the room/membership/activity model instead of adding parallel Crew membership tables. One `crew_messages` table supplies the lightweight room thread.
- Crews tab now loads signed-in Crew rooms; room detail includes members, proof-based leaderboard, recent activity, text thread, own-message deletion, and invite-code creation.
- You includes a caller-only blocked-user list with unblock.
- Social pgTAP coverage contains 47 transactional assertions for follow/reaction/comment/block/report/Crew invariants and the private privileged-RPC boundary. Foundation validation requires migrations `010` through `013`, ACL/RPC contracts, privacy/cursor invariants, mobile social surfaces, and the new test file.
- These Social Actions changes are not yet considered verified or integrated until PR metadata plus Foundation, Database, Mobile, and Web CI pass on the final head, migrations `010` through `013` are verified on staging, and the branch is merged to `dev`.

### Present but not fully external/device-verified
- Hosted Supabase must allow `proofmode://auth` before physical-device magic-link testing; the local Supabase config already allows it.
- Universal/App Link configuration exists; hosted association files and device-level tests are still required.
- Apple and Google sign-in still require real provider credentials/configuration and physical-device verification.
- Cloudflare R2/Stream credentials, Stream webhook registration/secret, production media delivery base URL, and `CRON_SECRET` must be configured in the deployed environment before end-to-end media validation.
- Physical-device camera/library selection and real R2/Stream upload/playback must still be exercised after those provider settings exist.
- The moderation lifecycle and queue handoff are implemented, but a real moderation worker/provider must consume `job_outbox` moderation jobs before ordinary uploaded posts automatically reach `published`.
- The remaining mobile moderate dependency findings are upstream Expo build/config-tooling constraints and should be re-audited when Expo publishes a compatible SDK-57 dependency update.
- Next.js has announced another scheduled security release for August 26, 2026; re-audit the locked root dependency set before any public release occurring after that patch is available.

### Completed pre-social audit pass
- Media/Create runtime, authorization, recovery, provider lifecycle, cleanup, account isolation, and focused-video behavior received a second pass and were hardened before integration.
- Feed publication-time eligibility is enforced by migration `009` and verified on staging.
- Root dependency reproducibility is locked and the high-severity Next/PostCSS/sharp findings are remediated.
- Mobile dependency findings are captured with their exact Expo/uuid chain and are explicitly left upstream rather than force-fixed.

### Not implemented
- Full Journey/proof ledger, streak/reset/comeback integration, and Passport history/metrics.
- Sharing/attribution and hosted universal-link association files.
- Push notifications/preferences.
- RevenueCat monetization.
- Sentry and PostHog production instrumentation.

## Execution order from here

1. **Finish Social Actions verification/integration** — full CI/control pass, staging migration verification, then merge Issue #21 into `dev`.
2. **Journey/proof integration** — proof ledger, streak/reset/comeback behavior, Passport metrics/history.
3. **Sharing and attribution** — exact-content links, hosted association files, native share, invite attribution.
4. **Push and monetization** — notification preferences/contextual push first, then RevenueCat.
5. **Closed alpha** — seed content, small real communities, activation/retention/safety/media-cost validation.

Auth provider/device configuration and Media/Create provider/device validation remain parallel release gates. They do not block safe code validation, but they must not be represented as complete until the real hosted/provider/device checks pass.

## DRY / KISS / YAGNI guardrails

- One Supabase client and one session provider. No custom auth framework.
- Domain-specific query functions only; no repository/data-access abstraction until real duplication exists.
- Keep authorization in RLS/RPC/server boundaries instead of duplicating it in clients.
- Keep internal `SECURITY DEFINER` helpers outside exposed schemas; expose only narrow invoker RPC wrappers when privileged implementation is necessary.
- Reuse challenge membership/invites as the Crew container; do not add duplicate Crew membership infrastructure.
- Social mutations with cross-table invariants stay RPC-owned; clients do not write those tables directly.
- Media provider credentials and publication state stay server-owned.
- Use the existing `job_outbox` before adding another queue service.
- Backend values are canonical. UI formatting stays in UI/mappers.
- Do not invent metrics the schema does not return.
- Do not silently replace failed production reads with demo data.
- Use existing Postgres/Supabase infrastructure before adding search, queues, or feed services.
- Use native share before platform posting SDKs.
- Do not add DMs, live video, ML ranking, broad contacts access, or unrelated features during MVP.
- Do not use `npm audit fix --force` or unsupported transitive overrides to make audit counts look clean.
- GitHub Issues are the durable work/handoff record. Conversation context is never the only place current state may live.
