# ProofMode 3.0 — Development Status

**Snapshot:** 2026-08-22  
**Purpose:** Single execution checkpoint for what is actually implemented. Product strategy remains in the master plan.

## Current state

### Implemented and verified
- Expo SDK 57 mobile app with Home / Explore / Post / Crews / You.
- Supabase migrations `001` through `006` are applied to the isolated live Proofmode staging project.
- The canonical launch library is enforced at exactly 60 challenge templates.
- RLS-only `SECURITY DEFINER` helpers live in the non-exposed `private` schema instead of public RPC space.
- The obsolete `join_public_challenge` RPC is removed; `join_challenge_v2` is the single join path.
- Billing synchronization is explicitly `service_role` only.
- One mobile Supabase client with persistent AsyncStorage-backed sessions.
- One root auth/session provider with foreground/background token refresh handling.
- The plan-required email magic-link fallback is implemented with `proofmode://auth` deep-link session completion; the temporary password bootstrap is removed.
- Public Home and Explore remain readable while signed out; Post, Crews, and You require a session.
- Home reads live `get_feed_v1` with pull-to-refresh and deterministic keyset infinite scroll.
- Explore reads live public Drops; public Drop detail supports persisted Join and Watch/Unwatch state.
- You reads the signed-in profile plus `get_profile_snapshot`.
- CI covers foundation validation, local Supabase startup, database linting, transactional pgTAP tests, mobile locked install/typecheck, and web typecheck/build.
- Live staging smoke checks verified auth-triggered profile creation and the current schema/security boundary.

### Present but not fully device-verified
- Hosted Supabase must allow `proofmode://auth` before physical-device magic-link testing; the local Supabase config already allows it.
- Universal/App Link configuration exists; hosted association files and device-level tests are still required.
- Create and Crew screens are authenticated shells; mutations/data are not connected yet.
- The root web project still lacks a lockfile, so web CI intentionally remains `npm install` until a lockfile can be generated and validated.

### Not implemented yet
- Apple / Google sign-in and provider-side credentials/configuration.
- Media capture/upload/processing/moderation/publish recovery.
- Reactions, comments, follows, live Crew data, report/block.
- Sharing/attribution, push, RevenueCat, Sentry, and PostHog.

## Execution order from here

1. **Finish auth** — configure/test the hosted magic-link redirect, then Apple and Google provider integration/configuration and physical-device tests.
2. **Media/create path** — capture/library, signed upload, processing state, moderation, publish recovery.
3. **Social actions** — reactions, comments, follows, Crew basics, report/block.
4. **Journey/proof integration** — proof ledger, streak/reset/comeback behavior, Passport metrics.
5. **Sharing and attribution** — exact-content links, hosted association files, native share, invite attribution.
6. **Push and monetization** — notifications/preferences first, then RevenueCat.
7. **Closed alpha** — seed content, small real communities, activation/retention/safety/media-cost validation.

## DRY / KISS / YAGNI guardrails

- One Supabase client and one session provider. No custom auth framework.
- Domain-specific query functions only; no repository/data-access abstraction until real duplication exists.
- Keep authorization in RLS/RPC boundaries instead of duplicating it in clients.
- Keep internal `SECURITY DEFINER` helpers outside exposed schemas.
- Backend values are canonical. UI formatting stays in UI/mappers.
- Do not invent metrics the schema does not return.
- Do not silently replace failed production reads with demo data.
- Use existing Postgres/Supabase infrastructure before adding search, queues, or feed services.
- Use native share before platform posting SDKs.
- Do not add DMs, live video, ML ranking, broad contacts access, or unrelated features during MVP.
