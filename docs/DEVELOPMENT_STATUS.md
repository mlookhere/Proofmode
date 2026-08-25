# ProofMode 3.0 — Development Status

**Snapshot:** 2026-08-24  
**Purpose:** Single execution checkpoint for what is actually implemented. Product strategy remains in the master plan. The GitHub control Issue mirrors this file plus live Issue/PR/CI state for zero-context recovery.

## Current state

### Implemented and verified
- Expo SDK 57 mobile app with Home / Explore / Post / Crews / You.
- Supabase migrations `001` through `017` are applied to the connected Proofmode staging project.
- The canonical launch library is enforced at exactly 60 challenge templates.
- RLS-only `SECURITY DEFINER` helpers live in the non-exposed `private` schema instead of public RPC space.
- The obsolete `join_public_challenge` RPC is removed; `join_challenge_v2` is the single join path.
- Billing synchronization is explicitly `service_role` only.
- Deterministic client table ACLs are encoded by migration `007`, matching local and hosted Supabase behavior required by the mobile client.
- Migration `008` centralizes media/post lifecycle transitions, prevents one media asset from backing multiple posts, keeps media mutation server-owned, and reuses `job_outbox` for moderation.
- Staging verification confirms the migration-008 index/functions/triggers exist and authenticated clients can read `media_assets` but cannot insert, update, or delete them.
- A rollback-only staging lifecycle smoke verified `ready → moderation_pending`, one deduplicated moderation job, and `approved → published` without leaving test data.
- Migration `009` explicitly excludes future-dated `published_at` rows from `get_feed_v1` without changing deterministic score or keyset ordering; rollback-only staging verification returned zero future rows and left no test data.
- A staging consistency audit found zero published/unapproved mismatches, published posts backed by unready media, media/post owner mismatches, active orphan media, deleted-media/live-post mismatches, ready-approved unpublished posts, or due background jobs.
- Social Actions migrations `010` through `014` are applied and verified on staging: RPC-owned follows/reactions/comments/block/report mutations, block-aware reads and aggregate privacy, Crew room messages/read models, invite creation, feed viewer relationship state, caller-only blocked-user listing, private privileged implementations, and Social-specific RLS/index performance hardening.
- All six Social write tables use RLS and deny direct `INSERT`, `UPDATE`, and `DELETE` to both `anon` and `authenticated`; persisted Social changes are RPC-owned.
- The 13 new Social Actions public RPCs are `SECURITY INVOKER` wrappers over privileged implementations in the non-exposed `private` schema with explicit role grants.
- A hosted rollback-only Social Actions smoke passed all 47 transactional assertions covering follows, reaction switching/unreact, comment create/read/own-delete, block/unblock and visibility, report validation/idempotency, Crew room/thread/invites, direct-write denial, and non-member denial, then left zero fixture rows.
- Migration `014` adds the covering `crew_messages.user_id` index and removes the Social-introduced auth init-plan advisor findings without broadening into unrelated legacy performance cleanup.
- Home is wired to real follow/unfollow, the five canonical reactions, text comments, own-comment deletion, post/comment/user reporting, and block behavior. Signed-out users may read public content/comments but must authenticate before persisted interaction.
- Public Drop detail includes report submission through the same reason taxonomy.
- Crews reuses `challenges`, `challenge_members`, proofs/posts, and invites as the room/membership/activity model instead of adding parallel Crew membership tables. One `crew_messages` table supplies the lightweight room thread.
- Crews tab loads signed-in Crew rooms; room detail includes members, proof-based leaderboard, recent activity, text thread, own-message deletion, and invite-code creation.
- You includes a caller-only blocked-user list with unblock.
- Social pgTAP coverage contains 47 transactional assertions for follow/reaction/comment/block/report/Crew invariants and the private privileged-RPC boundary. Foundation validation requires migrations `010` through `014`, ACL/RPC contracts, privacy/cursor invariants, Social performance hardening, mobile social surfaces, and the Social test file.
- Social Actions Issue #21 / PR #22 is integrated into `dev` at squash commit `1fdddf46e62f8de0c833606c203e6c2fdbb62320` and is `state:release-ready`; it is integrated but is not represented as a new production release yet.
- Journey/Proof/Passport migration `015` is applied and hosted-verified on staging. It reuses `journeys`, `proofs`, `verifications`, `posts`, challenge membership, and the media lifecycle instead of introducing a parallel reputation model.
- Journey state is server/database-owned: at most one active attempt per user/Drop, Reset is retry-safe through an idempotency token, prior attempts remain history, and direct Journey/proof/verification mutation remains denied to client roles.
- Published and approved Proof/Comeback/PR posts can create one canonical daily proof receipt through the publication lifecycle; Fail/Almost/Reset never create credibility receipts, and a long post caption is safely truncated only in the legacy 280-character ledger copy.
- Journey follows are block-aware and blocking severs Journey-follow edges. Public Journey/Passport RPCs are `SECURITY INVOKER` wrappers over explicit private implementations.
- Proof verification is separate from the social `Proven` reaction and requires an eligible challenge member other than the proof owner.
- Passport metrics are server-derived. Referral/recruit counts and purchased plan/status are presentation/growth state and do not change Proof Score.
- Legacy web proof creation and verification use the same authorized RPC boundary. Legacy proof media is verified against the caller's Supabase Storage path, while v3 R2/Stream receipts use their canonical media asset.
- Mobile includes live Journey navigation/timeline, chronological chapters, Follow Journey, Join/Start same Drop, Run It Back, member Verify/Reject, feed Journey doorway, and expanded You/Passport metrics, active Journeys, Trophy Case, and recent posts.
- Journey/Passport pgTAP contains 50 transactional assertions. Final Journey PR head `6a21dbeeedf20866ab9f33eae7e2a1c3c3928097` passed CI #102 before squash merge into `dev@16dd745655bddedebddfc6ac256a373af895f5f3`.
- Hosted Journey staging verification confirmed the migration ledger, RLS, six new indexes, two publication triggers, nine public invoker wrappers, private definer implementations, and no direct Journey/proof/verification write privileges for `anon` or `authenticated`.
- Rollback-only hosted Journey verification covered active-attempt idempotency, publication-owned receipts, caption compatibility, Fail/Almost/Reset exclusion, member verification, Journey follow/read/block behavior, Reset idempotency, Passport derivation, and paid-plan neutrality with zero fixture residue.
- Migration `016` hardens cross-layer ownership after the Journey integration. Client roles can no longer directly insert, update, or delete `posts`; the v3 media/post lifecycle remains server-owned.
- New post-to-Journey assignment is atomic through `assign_post_journey_v1`: the server-owned post exists first, then Journey ensure/Reset and post linkage occur in one database transaction. A forced-link-failure pgTAP proves a failed Reset link rolls back both the new attempt and ending the prior attempt.
- Reset upload retries retain their idempotency token, and the mobile Create flow removes a newly created server media/post intent if local recovery-state persistence fails.
- ProofMode Black now inherits Creator-scale challenge/member capacity consistently in both web challenge creation and database `join_challenge_v2` enforcement.
- `get_feed_v1`, `get_challenge_landing`, `get_public_challenge_snapshot`, `join_challenge_v2`, and `assign_post_journey_v1` expose narrow public `SECURITY INVOKER` entrypoints over private privileged implementations with explicit role grants.
- The verification API requires an explicit boolean verdict rather than interpreting malformed/non-true payloads as rejection.
- Cross-layer hardening pgTAP contains 25 transactional assertions for post ACLs, RPC boundaries, ordinary/Reset Journey assignment, forced rollback, Reset idempotency, Black capacity, and preserved public RPC access. CI #107 on code head `33a23bd0d7589e23f3a6ef13193fbe58ec3ee2bb` passed Foundation, Database startup/lint/all pgTAP, Mobile typecheck, and Web typecheck/build.
- Hosted migration `016` verification confirms all five public hardening/read/join entrypoints are invoker functions, all five private implementations are definers, expected execute grants are preserved, both client roles have no direct post writes, and the three obsolete post-write policies are absent.
- The post-016 security advisor has no exposed `SECURITY DEFINER` warnings; only the three pre-existing RLS-enabled/no-policy informational notices for server-only operational tables remain. The performance advisor also no longer reports the three obsolete post-write-policy init-plan findings; unrelated legacy FK/RLS/index notices remain separate technical debt.
- A post-016 hosted integrity audit returned zero mismatches for publication/moderation/media ownership, Journey/post and proof/post linkage, proof-producing post kinds, verification authorization, blocked social/Journey edges, duplicate active Journeys/daily proofs, future published posts, and ready media without posts.
- A rollback-only hosted hardening smoke verified direct-post-write denial, ordinary Journey assignment, Reset attempt-two creation and retry idempotency, Black member six, and anonymous public read wrappers, then confirmed zero fixture residue.
- Sharing/Attribution migration `017` is applied and hosted-verified on staging. It adds only three public-safe read RPCs for canonical post, Receipt, and invite-link resolution; each public function is a `SECURITY INVOKER` wrapper over a private privileged implementation with explicit `anon`, `authenticated`, and `service_role` execute grants.
- Receipts remain canonical `proofs` rows and IDs. Stage 10 adds no `receipts` table or alternate credibility ledger, and attribution state never participates in Proof Score, verification, streak, or leaderboard logic.
- Canonical HTTPS content contracts now cover `/p/:postId`, `/r/:receiptId`, `/c/:slug`, `/j/:journeyId`, `/u/:handle`, and `/invite/:code`; public-safe web fallbacks provide exact-content metadata/OG context plus Open in App/participation doorways, while Expo Router aliases resolve the same links to native destinations.
- Native sharing uses the operating-system share sheet across feed/post, Drop, Journey, Passport, Crew invite, and Receipt surfaces. Web uses Web Share with clipboard fallback rather than adding platform-specific posting SDKs.
- Receipt rendering supports deterministic 9:16, 4:5, and 1:1 SVG variants plus canonical text/link sharing. Receipt rendering reads through the same public-safe Receipt RPC rather than using a service-role bypass.
- Web and mobile preserve source/invite context across magic-link auth returns with a 30-day acquisition window. Analytics remains non-authoritative, while canonical invite ownership/claim state remains in `invites` and `invite_claims` through `join_challenge_v2`.
- Apple AASA and Android Digital Asset Links endpoints are implemented for `proofmode.app` and the `com.proofmode.app` identifiers. Missing or malformed signing identity fails closed with a non-cacheable configuration error instead of serving a misleading empty association.
- Stage 10 pgTAP contains 17 transactional assertions for public/private/moderation/block visibility, Receipt identity, invite resolution, explicit grants, invoker/definer separation, and the no-duplicate-Receipt-ledger rule. The earlier Journey same-day fixture is pinned to deterministic same-calendar-day timestamps so CI is no longer UTC-midnight-sensitive.
- CI #117 on Stage 10 code head `b901b17f7fa7d8c96d48877b1faa69b41bcaf1d1` passed Foundation, Database startup/lint/all pgTAP, Mobile typecheck, and Web typecheck/build before the first documentation checkpoint.
- CI #118 on documentation head `f1ff108684478a7627270b7b4cd29ae40d81ffee` also passed Foundation, Database startup/lint/all pgTAP, Mobile typecheck, and Web typecheck/build; any later documentation-only correction still requires the normal exact-head CI and PR-control gate before merge.
- Hosted Stage 10 verification confirms three public invoker wrappers, three private definers, all expected `anon`/`authenticated` execute grants, and zero `public.receipts` table. Rollback-only hosted behavior passed anonymous public post/Receipt reads, unpublished/private hiding, block-aware post/Receipt/invite hiding, invite capability resolution, and canonical invite-claim idempotency; both smoke passes left zero fixture residue.
- Post-017 security/performance advisors are unchanged from the pre-017 baseline: no new Stage 10 notices were introduced. The three existing RLS-enabled/no-policy informational notices and unrelated legacy FK/RLS/index findings remain separate technical debt.
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
- Foundation validation covers migration contracts, media/runtime hardening, Social Actions/security/performance contracts, Journey/Proof/Passport contracts, cross-layer hardening contracts, Sharing/Attribution route/RPC/share/association contracts, root package/lock parity, dependency security floors, TypeScript compatibility, and locked Web CI.
- CI covers foundation validation, local Supabase startup, database linting, transactional pgTAP tests, mobile locked install/typecheck, and web locked install/typecheck/build.
- GitHub Issues are the durable control plane: `main` is released history, `dev` is integration, and work/bug branches are Issue-backed. The repository is public; current repository control remains in force while native branch protection/rulesets can be evaluated separately.

### Present but not fully external/device-verified
- Hosted Supabase must allow `proofmode://auth` before physical-device magic-link testing; the local Supabase config already allows it.
- Universal/App Link code and hosted association endpoints are implemented and build-verified, but production `APPLE_TEAM_ID` / `ANDROID_APP_CERT_SHA256` values and physical-device link tests are still required. Fresh-install/deferred-link behavior is not claimed as device-verified.
- Apple and Google sign-in still require real provider credentials/configuration and physical-device verification.
- Cloudflare R2/Stream credentials, Stream webhook registration/secret, production media delivery base URL, and `CRON_SECRET` must be configured in the deployed environment before end-to-end media validation.
- Physical-device camera/library selection and real R2/Stream upload/playback must still be exercised after those provider settings exist.
- The moderation lifecycle and queue handoff are implemented, but a real moderation worker/provider must consume `job_outbox` moderation jobs before ordinary uploaded posts automatically reach `published`.
- The remaining mobile moderate dependency findings are upstream Expo build/config-tooling constraints and should be re-audited when Expo publishes a compatible SDK-57 dependency update.
- Next.js has announced another scheduled security release for August 26, 2026; re-audit the locked root dependency set before any public release occurring after that patch is available.

### Completed integration audit pass
- Media/Create runtime, authorization, recovery, provider lifecycle, cleanup, account isolation, focused-video behavior, Social Actions, Journey/Proof/Passport, Sharing/Attribution, and their shared database boundaries received integration validation.
- Cross-layer defects found by the prior audit remain captured in Issue #25 / PR #26 and verified by migration `016`, pgTAP, CI, hosted advisors, integrity queries, and rollback-only staging behavior checks.
- Stage 10 Sharing/Attribution is implemented in Issue #27 / PR #30, with migration `017`, CI #117 on the code head, CI #118 on the first documentation head, hosted RPC/ACL verification, unchanged advisors, rollback-only public/private/block behavior checks, and invite-claim idempotency verification. Final exact-head CI and PR-control remain mandatory after any later documentation-only correction and before merge to `dev`.
- Feed publication-time eligibility remains enforced by migration `009` and verified on staging.
- Root dependency reproducibility remains locked and the prior high-severity Next/PostCSS/sharp findings remain remediated.
- Mobile dependency findings remain captured with their exact Expo/uuid chain and are explicitly left upstream rather than force-fixed.

### Not implemented
- Push notifications/preferences.
- RevenueCat monetization.
- Sentry and PostHog production instrumentation.

## Execution order from here

1. **Push and monetization** — notification preferences/contextual push first, then RevenueCat.
2. **Closed alpha** — seed content, small real communities, activation/retention/safety/media-cost validation.

Auth provider/device configuration, Universal/App Link device verification, and Media/Create provider/device validation remain parallel release gates. They do not block safe code validation, but they must not be represented as complete until the real hosted/provider/device checks pass.

## DRY / KISS / YAGNI guardrails

- One Supabase client and one session provider. No custom auth framework.
- Domain-specific query functions only; no repository/data-access abstraction until real duplication exists.
- Keep authorization in RLS/RPC/server boundaries instead of duplicating it in clients.
- Keep internal `SECURITY DEFINER` helpers outside exposed schemas; expose only narrow invoker RPC wrappers when privileged implementation is necessary.
- Reuse challenge membership/invites as the Crew container; do not add duplicate Crew membership infrastructure.
- Social mutations with cross-table invariants stay RPC-owned; clients do not write those tables directly.
- Journey/proof credibility mutations stay RPC/server-owned; clients never write proof, verification, or attempt state directly.
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