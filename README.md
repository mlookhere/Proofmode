# ProofMode 3.0 — Participation Network Master Build

**Don't post the plan. Post the proof.**

ProofMode 3.0 expands the original verified-challenge product into a participation network designed around two linked loops:

```text
Entertainment: open → watch → react → follow story → return
Participation: watch → try → post → verify → share/challenge → recruit
```

The product rule is simple: **every entertaining object should expose a doorway into participation.**

## What this package contains

This is both an implementation upgrade to the existing ProofMode web app and the master implementation/launch package for the mobile MVP.

### Implemented/reference product surfaces
- `/feed` — ProofTV entertainment-feed reference with Proof / Fail / Comeback / Chaos content.
- `/explore` — idea/template-first discovery so users never face a blank challenge form.
- `/create` — Proof / Fail / Almost / Comeback / PR / Reset posting entry model.
- `/journeys/demo` — bingeable attempt/story timeline reference.
- existing `/drops`, `/c/[slug]`, `/u/[handle]`, dashboard, proof verification and receipt sharing from v2.
- `mobile/` — Expo SDK 57 five-tab native consumer-shell reference: Home / Explore / Post / Crews / You.
- `supabase/migrations/003_entertainment_engine.sql` — posts, journeys, media metadata, follows, Watch Drop, reactions, comments, interests, templates, blocks, reports, moderation actions, push tokens, notification preferences and feed RPC.

### Master plan
Start with [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md), then use:
- [`docs/MVP_SPEC.md`](docs/MVP_SPEC.md)
- [`docs/IMPLEMENTATION_BACKLOG.md`](docs/IMPLEMENTATION_BACKLOG.md)
- [`docs/FUTURE_STATE.md`](docs/FUTURE_STATE.md)
- [`docs/ARCHITECTURE_COSTS.md`](docs/ARCHITECTURE_COSTS.md)
- [`docs/GROWTH_LAUNCH.md`](docs/GROWTH_LAUNCH.md)
- [`docs/MONETIZATION.md`](docs/MONETIZATION.md)
- [`docs/TRUST_SAFETY.md`](docs/TRUST_SAFETY.md)
- [`docs/UX_DESIGN_BRIEF.md`](docs/UX_DESIGN_BRIEF.md)
- [`docs/KPI_ANALYTICS.md`](docs/KPI_ANALYTICS.md)
- [`docs/QA_RELEASE_CHECKLIST.md`](docs/QA_RELEASE_CHECKLIST.md)
- [`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md)
- [`docs/PLATFORM_INTEGRATIONS.md`](docs/PLATFORM_INTEGRATIONS.md)
- [`docs/ASSET_INVENTORY.md`](docs/ASSET_INVENTORY.md)
- [`docs/MISSING_PIECES.md`](docs/MISSING_PIECES.md)

## Recommended production architecture

### Native consumer app
Expo / React Native + Expo Router.

### Public web, creator studio, admin
Next.js 16 on Vercel.

### Core data/auth/realtime
Supabase Postgres/Auth/Realtime with RLS and server-side entitlement/seat enforcement.

### User media
- Images: Cloudflare R2 + Images.
- Video: Cloudflare Stream.
- Do not proxy consumer video through Next.js/Vercel functions.

### Supporting services
- PostHog — product analytics/feature flags.
- RevenueCat — normalized iOS/Android/web entitlement state.
- Stripe — web billing path where policy/legal review permits.
- Upstash — rate limits/hot cache when needed.
- Resend — transactional email.
- Sentry — errors/releases.

Current pricing/reference links are timestamped in `docs/SOURCES_2026-08.md`. Re-check before buying or submitting to app stores.

## Database setup

Apply in order:

```text
supabase/migrations/001_init.sql
supabase/migrations/002_growth_engine.sql
supabase/migrations/003_entertainment_engine.sql
supabase/migrations/004_template_library.sql
```

### Important v3 modeling rule
`proofs` remain the credibility ledger. `posts` are the entertainment/social layer.

That means a Fail, Almost, Chaos, BTS or Reset post can be fun and highly distributed without pretending it is verified accomplishment. A post may optionally point to a real verified `proof_id`.

## MVP scope

The MVP is intentionally **not** every idea in the future-state document.

Ship first:
- populated full-screen feed,
- fast native camera/library post flow,
- 6 core post outcomes,
- template-first Explore,
- join/watch Drop,
- basic Journeys,
- follows/reactions/comments,
- private Crews at basic level,
- Passport + verified proof history,
- native sharing + canonical deep links,
- referral attribution,
- contextual push notifications,
- Proof+ and Creator subscriptions,
- reporting/blocking/moderation admin,
- analytics and spend monitoring.

Do **not** block MVP on live video, DMs, automated video editing, complex feed ML, marketplace payouts, global location competition or a large Black directory.

## Exact execution order

1. Freeze product vocabulary and safety boundaries.
2. Create staging/prod accounts and CI.
3. Apply/QA social schema and RLS.
4. Wire Cloudflare image/video direct-upload pipeline.
5. Wire mobile auth/session.
6. Build native five-tab shell.
7. Build feed + post detail + action-after-watch events.
8. Build create/upload/publish state machine.
9. Build Explore/templates + Watch/Join.
10. Build follows/reactions/comments/Crews.
11. Build Journey/Passport history.
12. Build canonical links, web fallbacks and native sharing.
13. Build push/deep-link notifications.
14. Build RevenueCat entitlements/paywalls + server cache.
15. Build creator studio controls.
16. Build report/block/moderation/admin tooling.
17. Closed alpha with house content and real small communities.
18. Fix activation/retention/safety/cost issues.
19. Seed 25–50 participatory microcreators.
20. Quietly recruit Black Founding 100 candidates.
21. Preload active Drops/content.
22. Launch Receipt Season 001.
23. Add platform-specific posting integrations only after native sharing works.
24. Add paid acquisition only after organic participation and retention are proven.

The detailed dependencies and acceptance criteria are in the master plan/backlog.

## Monetization model

### Free
The network must be genuinely useful. Free users create the supply and distribution.

### Proof+
Target price test: **$9.99/mo or $79.99/yr**.
Sell identity/expression and software utility: Passport/receipt styles, deeper stats, private social controls, premium seasonal cosmetics, advanced history and early features. Never sell Proof Score, verification or leaderboard truth.

### Creator
Target test: **$39/mo** (test a range).
Sell community operating tools: larger Drops, analytics, scheduled launches, co-hosting, branding, reusable launch assets and moderation tools.

### Black
Target anchor: **$499/mo or $4,999/yr**, invite-only; strategic creators can receive comped 12-month Founding membership.
No public application. The real value is curated access/collaboration, special launch powers and status—not high marginal-cost perks.

## Launch assets

See `assets/` for:
- launch copy,
- creator/manager/Black outreach,
- first 100 seed-post plan,
- starter challenge-template JSON,
- notification copy,
- empty-state UX copy.

## Local web

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Native reference

```bash
cd mobile
npm install
npm run start
```

For a clean native regeneration, current Expo documentation recommends:

```bash
npx create-expo-app@latest --template default@sdk-57
```

Then use `npx expo install` for SDK-compatible camera/video/notification/linking packages. See `mobile/README.md`.

## Validation before any public launch

Run:

```bash
npm run typecheck
npm run build
```

And separately validate the mobile package/device builds. Then complete every P0 item in `docs/QA_RELEASE_CHECKLIST.md`.

A syntax/transpile validation is useful but is not a substitute for a dependency-backed build, device testing, migration testing against a staging Supabase database, app-store sandbox purchases, or real moderation drills.
