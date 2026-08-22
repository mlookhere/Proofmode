# ProofMode 3.0 — Technical Architecture & Cost Plan

## Recommended stack

| Layer | Recommendation | Purpose |
|---|---|---|
| Mobile | Expo / React Native + Expo Router | native iOS/Android |
| Web/Studio | Next.js on Vercel | public acquisition, SEO, creator/admin |
| Database | Supabase Postgres | social/proof relational data |
| Auth | Supabase Auth | Apple/Google/email |
| Realtime | Supabase Realtime | selective live social updates |
| Photos | Cloudflare R2 + Images | low-cost object storage + transforms |
| Video | Cloudflare Stream | direct upload, encode, adaptive playback |
| Cache/rate limits | Upstash Redis | hot cache, abuse protection |
| Analytics/flags | PostHog | funnel/cohort/experiments |
| Subscriptions | RevenueCat | App Store/Play/web entitlements |
| Web billing | Stripe / RevenueCat Web | web subscription path |
| Email | Resend | transactional email |
| Errors | Sentry | mobile/web observability |

## Architecture

```text
iOS/Android Expo ─┬──────────────► Supabase (DB/Auth/Realtime)
                  ├──────────────► Cloudflare R2/Images
                  ├──────────────► Cloudflare Stream
                  ├──────────────► PostHog
                  └──────────────► RevenueCat

Next.js/Vercel ───┬──────────────► Supabase
                  ├──────────────► Cloudflare
                  ├──────────────► PostHog
                  └──────────────► RevenueCat/Stripe

Shared backend ───► Upstash / Resend / Sentry
```

## Media pipeline

### Images
client → signed authorization → direct R2 upload → media row → moderation state → Cloudflare Images delivery.

Suggested variants:
- feed 1080×1920
- preview 540×960
- square 1080×1080
- OG 1200×630
- avatar 256×256

### Video
client → one-time Stream direct-upload URL → Stream processes → webhook → media ready → moderation → publish.

Never proxy uploaded video through Next.js functions or ordinary Vercel bandwidth.

Post lifecycle:
`draft → uploading → processing → moderation_pending → published`

## Feed scaling

### MVP
Postgres candidate queries + heuristic rank + cursor pagination + short cache.

### Next
Materialized/precomputed trending and cohort candidate lists.

### Later
Dedicated feed service only when data proves it is required.

## Search
Start with Postgres full-text/trigram search. Add dedicated search only when relevance/latency requires it.

## Push
Start with Expo notifications abstraction:
- per-device token
- deep-link URL
- notification preference
- dedupe key
- daily notification budget

## Subscription architecture
Use RevenueCat as normalized mobile entitlement source. Cache server-side entitlements in Supabase for fast authorization. Keep restore/manage subscription flows.

Store policy is regional and changes; review current Apple/Google rules at each release.

## Cost-control rules
1. Video does not traverse Vercel as feed bandwidth.
2. Direct-to-provider uploads.
3. Preload only near-future feed media.
4. Adaptive video.
5. Delete abandoned/temp media.
6. Finite image variants.
7. Cache public share pages.
8. Rate-limit social writes.
9. Keep feed ranking simple.
10. Turn on budget alerts/spend caps everywhere.

## Current public pricing reference points — August 2026
Re-check before purchase.

- **Vercel Pro:** $20/mo base. https://vercel.com/pricing
- **Supabase Pro:** from $25/mo. https://supabase.com/pricing
- **R2 Standard:** $0.015/GB-month, direct R2 internet egress $0. https://developers.cloudflare.com/r2/pricing/
- **Cloudflare Stream:** current docs list $5/1,000 stored video minutes and $1/1,000 delivered minutes. https://developers.cloudflare.com/stream/
- **Expo Starter:** currently $19/mo; Free exists. https://expo.dev/pricing
- **RevenueCat:** free through $2,500 monthly tracked revenue, then current Pro is 1%. https://www.revenuecat.com/pricing
- **PostHog:** current free product-analytics tier includes 1M events/mo. https://posthog.com/
- **Resend:** current free tier 3k transactional emails/mo; Pro starts $20/mo. https://resend.com/pricing

### Practical production floor
Rough fixed infrastructure can begin around **$45–$64/month** before variable media, optional paid observability, app-store developer fees, legal/business costs and team seats.

### Video formula
`stream cost ≈ stored_minutes / 1000 * $5 + delivered_minutes / 1000 * $1`

Example:
5,000 stored minutes + 200,000 delivered minutes ≈ $25 + $200 = **$225/mo** for Stream.

This is why clip length, autoplay/preload, retention policy and media cost/WMP are core product metrics.

## Security
- RLS on exposed tables
- service role server-only
- signed upload URLs
- signed/idempotent webhooks
- validated deep links
- least-privilege API tokens
- rate limits
- admin audit log
- staging isolated from production

## Background jobs without another paid vendor
For MVP, use the `job_outbox` table in migration 003 and a small scheduled/service-role worker for media-finalization retries, moderation, push, email and cleanup. Move to a dedicated queue only when backlog depth, throughput or worker reliability proves it is needed. This preserves durability without paying for architecture you have not earned yet.

## When to reconsider Vercel
Keep Vercel while it accelerates product iteration and the public/creator web is not the dominant cost center. Media must stay off its request path. If web/edge compute becomes materially expensive at scale, benchmark Cloudflare Workers/OpenNext or another hosting path against the actual production workload before migrating; do not rewrite preemptively.

## Cost estimator
A simple planning helper is included:

```bash
npm run cost:estimate -- --stored=5000 --delivered=200000 --r2gb=50
```

This is a list-price planning aid, not an invoice forecast. Provider rounding, request operations, overages, taxes and program fees are intentionally excluded and documented in the output.
