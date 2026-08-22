# ProofMode 3.0 — Development Status

**Snapshot:** 2026-08-22  
**Purpose:** Single execution checkpoint for what is actually implemented. Product strategy remains in the master plan.

## Current state

### Implemented in code
- Expo SDK 57 mobile app with Home / Explore / Post / Crews / You.
- Supabase migrations `001` through `005`, including social/media/safety schema, `get_feed_v1`, profile snapshots, and 60 launch templates.
- iOS associated-domain and Android App Link intent configuration.
- Local / staging / production mobile public environment contract.
- One mobile Supabase client with persistent AsyncStorage-backed sessions.
- One root auth/session provider with React Native foreground/background token refresh handling.
- Email/password sign-in and sign-up are implemented as the current staging bootstrap path; the product plan still requires Apple/Google with email magic-link fallback before release.
- Public Home and Explore remain readable while signed out; Post, Crews, and You require a session.
- Home reads the live `get_feed_v1` RPC with pull-to-refresh and keyset-based infinite scroll.
- Explore reads live `challenge_templates`.
- You reads the signed-in `profiles` row and `get_profile_snapshot` metrics instead of demo profile numbers.
- Demo records remain isolated and are used only when no Supabase environment is configured, never as a silent fallback after a live backend error.
- Foundation validation and CI cover schema/static checks, transactional Supabase pgTAP database tests, mobile locked install/typecheck, and web typecheck/build.
- Supabase local project config and repeatable database tests cover RLS, auth/profile triggers, join/watch boundaries, and feed pagination.
- Mobile package and Expo app versions are kept in sync by validation.

### Present but not production-verified
- Local/CI database verification is wired, but migrations and RLS still need the same pgTAP suite run against the real isolated staging Supabase project.
- Universal/App Link app configuration exists; hosted association files and device-level tests are still required.
- Create and Crew screens are authenticated shells; their mutations/data are not connected yet.

### Not implemented yet
- Apple / Google sign-in and the plan-required email magic-link fallback/recovery flow.
- Challenge join/watch mutations.
- Media capture/upload/processing/moderation/publish recovery.
- Reactions, comments, follows, live Crew data, report/block.
- Sharing/attribution, push, RevenueCat, Sentry, and PostHog.
- Root web lockfile hardening; the web CI job still uses `npm install`.

## Execution order from here

1. **Staging verification** — link the isolated staging project, dry-run/apply migrations `001→005`, run the pgTAP suite against staging, then test the live mobile reads and feed pagination.
2. **Finish auth** — Apple, Google, the plan-required email magic-link fallback/recovery flow, provider configuration, device tests.
3. **Challenge actions** — join/watch and the minimum persisted state needed by Explore.
4. **Media/create path** — capture/library, signed upload, processing state, moderation, publish recovery.
5. **Social actions** — reactions, comments, follows, Crew basics, report/block.
6. **Journey/proof integration** — proof ledger, streak/reset/comeback behavior, Passport metrics.
7. **Sharing and attribution** — exact-content links, hosted association files, native share, invite attribution.
8. **Push and monetization** — notifications/preferences first, then RevenueCat.
9. **Closed alpha** — seed content, small real communities, activation/retention/safety/media-cost validation.

## DRY / KISS / YAGNI guardrails

- One Supabase client and one session provider. No custom auth framework.
- Domain-specific query functions only; no generic repository/data-access abstraction until multiple implementations create real duplication.
- Backend values are canonical. UI formatting stays in UI/mappers.
- Do not invent metrics the schema does not return.
- Do not silently replace failed production reads with demo data.
- Do not implement unstable pagination just because an RPC exposes a cursor-shaped parameter.
- Use existing Postgres/Supabase infrastructure before adding search, queues, or feed services.
- Use native share before platform posting SDKs.
- Do not add DMs, live video, ML ranking, broad contacts access, or unrelated features during MVP.
