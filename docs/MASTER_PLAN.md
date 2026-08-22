# ProofMode 3.0 — Master Product, Build, Launch & Scale Plan

**Category:** The participation network  
**Positioning:** *The social network for people who actually do things.*  
**Core loop:** Watch → Try → Prove → React → Share → Recruit → Return  
**Launch wedge:** Fitness/run clubs + creator-led challenges, then builder/creative communities.

This is the controlling plan for ProofMode 3.0. The order is deliberate: do not build flashy growth surfaces before the core loop, trust/safety, data model, media economics, and measurement work.

## 1. Product model

ProofMode should own a different action from existing social platforms:

- TikTok: watch.
- Instagram: see/share.
- YouTube: watch/learn.
- Discord: talk.
- Strava: log.
- **ProofMode: try something and prove it.**

Every entertaining post should contain a doorway into participation.

Core objects:

1. **Post** — Proof, Fail, Almost, Comeback, PR, Chaos, BTS, Reset.
2. **Passport** — persistent identity/reputation.
3. **Drop** — a challenge/event.
4. **Journey** — one person’s chronological attempt at a Drop.
5. **Crew** — small private group.
6. **Receipt** — shareable proof object that carries ProofMode into other networks.

Paid/status layers:
- **Proof+** — identity, expression, analytics, convenience.
- **Creator** — community operations, analytics, growth tools.
- **ProofMode Black** — invitation-only creator network and studio tier.

## 2. Non-negotiable principles

### Entertainment without empty calories
ProofMode can support doomscrolling, but the feed should optimize for participation intent, not watch time alone.

Every feed object should offer a meaningful action: Try It, Join, Beat Them, Respond With Proof, Follow Journey, Watch Drop, Cheer, Run It Back.

### Failure is content, not churn
Broken streaks do not erase accomplishment. Fails, resets and comebacks create story. Keep prior bests and offer a comeback path.

### Reputation cannot be purchased
Never sell Proof Score, verification, completed days, leaderboard rank, or earned rarity. Sell expression, tools, access, analytics and cosmetics.

### Public feed + private intimacy
Public content creates discovery. Private Crews create retention.

### Share outward
Treat Instagram, TikTok, Snapchat, Messages, WhatsApp, Discord, etc. as distribution channels. Every exported asset resolves to a ProofMode universal link.

### Mobile-first consumer experience
The public website remains important for SEO, shared links, creator pages, billing and admin. The core consumer experience should be iOS/Android because camera, vertical video, push, sharing and deep links are core mechanics.

# 3. MVP: what must ship

The MVP is the smallest complete loop that can test repeat behavior and organic invitations.

## Consumer screens

### Home / ProofTV
Full-screen vertical feed.

MVP post types:
- Proof
- Fail
- Almost
- Comeback
- PR
- Reset

Each card:
- creator identity
- Drop context
- media
- caption
- streak/day when relevant
- reactions/comments/share
- primary participation CTA
- report/block/not interested

Feed modes:
- For You
- Following
- Friends when graph exists

Ranking v1 should be heuristic, not ML.

### Explore
Sections:
- Trending
- Start Today
- Easy Wins
- 7 Day
- 30 Day
- With Friends
- Fitness
- Build
- Create
- Learn
- Funny/Low-stakes
- Featured creators

Challenge cards answer:
- What do I do?
- What counts?
- Difficulty
- Duration
- Proof method
- Participants
- Example

### Create
One creation flow.

1. What happened? Proof / Fail / Almost / Comeback / PR / Reset.
2. Select or create Drop context.
3. Camera/library.
4. Caption + metadata.
5. Publish.

A Fail must never silently count as verified proof.

### Crews
MVP:
- user’s Drops/Crew rooms
- recent activity
- leaderboard
- members
- invite
- lightweight room thread

Do not build full DMs in MVP.

### You / Passport
- avatar/handle
- level
- Proof Score
- verified receipts
- longest/current streak
- founder badges
- active Journeys
- trophy case
- recent public posts
- Proof+ identity treatment

# 4. MVP onboarding

Do not open with a blank challenge form.

1. Shared link or install.
2. Let users view public content before signup.
3. Ask for signup when they Join, Comment, Post, Follow or need persisted interaction.
4. Apple + Google sign in; magic-link fallback.
5. Choose 3–5 interests.
6. Choose intent: “Give me ideas / I already have a goal / I’m here with friends.”
7. Feed is populated immediately.
8. Suggest 3 Drops; allow skip.
9. Ask for notifications only after a reason exists.
10. Ask for contacts only at Find Friends / Invite Crew.

# 5. MVP content model

Posts are separate from earned proofs.

A post may be entertaining, connected to a Drop, connected to a verified proof, connected to a Journey, or a response to another post.

Post kinds:
`proof | fail | almost | comeback | pr | chaos | bts | reset`

MVP exposes the first six prominently.

Media:
- image
- video

Do not put arbitrary third-party embeds into the main feed. External content can later be attached as context, while ProofMode owns the interaction.

# 6. MVP social graph

Relationships:
- follow user
- watch Drop
- member of Drop
- member of Crew
- block user
- invite attribution

Reactions:
- Proven
- Respect
- LOL
- Run It Back
- I’m Next

Do not ship “Call Cap” as a crowd downvote in MVP; it creates brigading/moderation risk before norms exist.

Comments:
- text
- mentions after block/report is reliable
- no images/GIFs in first release

# 7. Journey system

Journey = user + Drop + attempt.

It groups posts into a chronological story.

Journey page:
- Drop
- participant
- current status
- start date
- verified count
- best streak
- timeline
- “Start from Day 1”
- Follow Journey
- Join same Drop

This turns viral single posts into bingeable stories.

# 8. Template library

Templates are essential to user friendliness. Start with ~60 high-quality templates.

Fields:
- title
- promise
- category
- difficulty
- duration presets
- proof method
- safety notes
- starter rules
- example caption
- cover
- popularity/trending metadata

First categories:
Run/Walk, Gym/Movement, Food/Cooking, Study, Build/Ship, Work/Sales, Art/Create, Reading, Outdoors, Funny/Social.

Examples:
Walk 10K Steps, Run 1 Mile, 20 Pushups, Cook at Home, Read 20 Pages, Ship One Thing, 20 Sales Calls, One Sketch, Touch Grass, Try One New Food, No DoorDash.

# 9. MVP sharing

Use native share sheet first; do not wait for every platform API.

Generate:
- 9:16 Receipt
- 4:5 portrait
- 1:1 square
- text/link

Canonical public URL:
`https://proofmode.com/p/{id}`

Installed app → exact native screen.  
Not installed → exact web content → Open in App / Try / Join.

CTA variants:
Beat Me, Try It, Join My Drop, Keep This Going, Follow My Journey.

# 10. MVP notifications

Push should communicate stakes, not generic reminders.

Good:
- “Maya responded to your challenge.”
- “Your Crew needs one proof to take #3.”
- “Jake is one day from passing you.”
- “The person you followed after yesterday’s fail posted a comeback.”
- “Round 2 starts today.”

Notification classes:
- direct social
- Drop starts/ends
- streak risk
- watched Drop
- Crew position
- Journey continuation
- invite accepted

Independent user preferences for each class.

# 11. MVP monetization

## Free
Free must feel complete:
feed, posting, join/watch public Drops, basic Passport, Crews, comments/reactions, core receipts, basic history, sharing, safety.

## Proof+ — test $9.99/mo / $79.99/yr
Low marginal-cost value:
- premium Passport themes
- premium Receipt styles
- custom app icons
- profile treatments
- deeper personal analytics
- full history
- expanded private Drop limits
- premium recap layouts
- seasonal cosmetics
- early feature access

Do not gate basic proof/join/view/safety.

## Creator — test $39/mo
- large Drops
- branded Drop pages
- recurring/scheduled Drops
- cohosts
- creator analytics
- conversion/referral attribution
- custom receipt themes
- moderation tools
- web Creator Studio
- QR/poster launch kits

## ProofMode Black — target $499/mo or strategically comped
Public description only:
“ProofMode Black is a private membership for selected creators, athletes, founders and cultural leaders. Invitation only.”

No Apply button. No follower-count form. No self-nomination.

Black should initially be primarily a web Creator Studio/network product with selected in-app status/entitlements. Mobile purchase paths must remain compliant with current Apple/Google rules by region.

Black:
- Creator+
- private directory
- collaboration requests
- cohost matchmaking
- Black rooms
- product lab
- advanced analytics
- multi-admin teams
- selected featured Drop eligibility
- custom launch assets

### Founding 100
Invite 100 high-leverage people. Selected creators receive a time-bounded complimentary Black membership and permanent “BLACK — FOUNDING 100” badge.

# 12. Trust & safety — launch blocker

Required before public release:
- Terms acceptance before posting
- Community Guidelines
- report content
- report user
- block user
- mute/not interested
- moderation queue
- strike/action history
- takedown tools
- admin
- published support/contact
- declared age
- risky-challenge taxonomy
- anti-spam/rate limits
- no exact location by default

Block/review high-risk challenges: self-harm, starvation/extreme cuts, dangerous stunts, illegal acts, substance challenges, sleep deprivation, weapons, harassment/humiliation.

# 13. Recommended architecture

- **Mobile:** Expo / React Native + Expo Router
- **Public web + Creator Studio:** Next.js App Router on Vercel
- **Database/Auth/Realtime:** Supabase
- **Photos:** Cloudflare R2 + Cloudflare Images
- **Video:** Cloudflare Stream
- **Rate limiting/cache:** Upstash Redis
- **Analytics/feature flags:** PostHog
- **Subscriptions:** RevenueCat for mobile/cross-platform entitlements; Stripe/RevenueCat Web for web
- **Email:** Resend
- **Errors:** Sentry or equivalent

Do not stream a TikTok-style feed through Vercel bandwidth or ordinary database storage.

# 14. Exact implementation order

## Stage 0 — Freeze vocabulary
Post, Proof, Fail, Drop, Journey, Crew, Passport, Receipt, Proof+, Creator, Black.

**Gate:** a new tester can explain the app after one session.

## Stage 1 — Repository/infrastructure
- keep Next.js web
- add Expo mobile
- shared TS domain types
- local/staging/production
- CI typecheck/build
- Sentry
- PostHog
- migration workflow
- media-provider interfaces

## Stage 2 — Social data model
Add posts, Journeys, follows, watched Drops, reactions, comments, interests, templates, blocks, reports, moderation actions, push tokens, media assets.

## Stage 3 — Media pipeline
Image: signed direct upload → R2 → transform.  
Video: one-time direct upload → Stream → processing webhook.

Lifecycle:
`draft → uploading → processing → moderation_pending → published`

## Stage 4 — Mobile shell
Five tabs + auth + design tokens + loading/error/offline + deep links.

## Stage 5 — Feed
Vertical paging, current/next media preload, video pause offscreen, actions, impressions, ranking v1.

## Stage 6 — Create/post
Camera/library, post kind, upload progress/recovery, caption, Drop context, publish/delete.

## Stage 7 — Explore/templates
Interest onboarding, template library, Drop creation from template, search.

## Stage 8 — Social
Follows, reactions, comments, Watch Drop, Follow Journey, invite links.

## Stage 9 — Proof/Journey/Passport
Unify verified ledger, public post, streak, Journey timeline, Passport.

## Stage 10 — Sharing/acquisition
Receipt generator, share pack, universal/app links, attribution, no-login shared pages.

## Stage 11 — Notifications
Push registration/preferences, social/stake rules, deep links, anti-spam budget.

## Stage 12 — Monetization
RevenueCat, App Store/Play products, web sync, paywalls, restore, server entitlement enforcement.

## Stage 13 — Creator Studio
Launch/schedule Drop, analytics, invites, audience, moderation, theme, cohost.

## Stage 14 — Safety/admin
Moderation dashboard, report queue, strikes, bans, creator verification, Black invite management.

## Stage 15 — Closed alpha
Internal/friends + 3–5 real communities. Fix posting friction, empty states, broken links, confusing language, media failures.

## Stage 16 — Seed supply
25–50 microcreators + run clubs/gyms/campuses/builders/creatives. Each launches before broad demand arrives.

## Stage 17 — Receipt Season 001
Creator Drops, Founder badges, daily highlights, fail/comeback programming, share-first receipts.

## Stage 18 — Paid acquisition
Only after organic loop/retention is measurable. Amplify proven creator/content formats.

# 15. Feed ranking v1

Candidate sources:
- followed people
- friends/Crew
- active Drops
- chosen interests
- trending
- editorial
- comeback/story continuation
- exploration

Score inputs:
- completion/rewatch
- reactions/comments
- shares
- Try/Join/Respond
- relationship
- freshness
- story continuity
- creator quality
- hide/report/block penalties
- repetition penalty

A `try`, `join`, `respond`, or `follow_journey` should be worth more than passive watch time.

# 16. KPI system

## North Star: Weekly Meaningful Participants
Unique users in a rolling week who do at least one:
- publish a Drop/Journey post
- submit verified proof
- join a Drop from content
- respond with proof

## D7 Participating Retention
Activated users who return on Day 7 and perform a meaningful participation action.

## Organic Participation Coefficient
New activated participants attributable to organic shares/invites divided by participating senders.

Drivers:
- view → Try
- share → landing
- landing → signup
- signup → Join
- Join → first Post
- first Post → second Post
- Watch → later Join

Guardrails:
- reports/1k impressions
- blocks/1k impressions
- media cost/WMP
- notification opt-out
- crash-free sessions
- upload failure

# 17. Not MVP

Post-MVP:
- Battles
- Proof Chains
- Moments
- daily recap
- local/city competition
- auto-edit
- platform-specific direct-post APIs
- DMs
- live video
- creator marketplace
- Black network directory
- IRL QR activation
- advanced recommendation ML

# 18. Future-state sequence

1. **Story/retention:** Journey binge, Watch Mode, recaps.
2. **Competition:** 1v1/Crew Battles, Proof Chains, responses.
3. **Culture:** Seasons, rare earned badges, global Drops, editorial rituals.
4. **Creator network:** Black Founding 100, private directory, cohost collaboration.
5. **Creation:** auto-edit, clip selection, captions, receipt overlays.
6. **IRL/local:** QR Drops, coarse opt-in location, clubs/venues.
7. **Live:** only after real moderation/ops maturity.
8. **Recommendation intelligence:** heuristic → experiments → ML only when justified.

# 19. What product alone does not solve

Before real launch also complete:
- legal Terms/Privacy/Community Guidelines/creator terms
- IP/DMCA process
- support and moderation operations
- house content
- creator seed supply
- store screenshots/privacy disclosures/review notes
- creator launch kit
- attribution
- analytics dashboards
- incident playbook

# 20. Research references (reviewed August 2026)

- Vercel: https://vercel.com/pricing
- Supabase: https://supabase.com/pricing
- Cloudflare R2: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Stream: https://developers.cloudflare.com/stream/
- Cloudflare Images: https://developers.cloudflare.com/images/pricing/
- Expo Router: https://docs.expo.dev/router/introduction/
- Expo pricing: https://expo.dev/pricing
- RevenueCat: https://www.revenuecat.com/pricing
- Apple App Review: https://developer.apple.com/app-store/review/guidelines/
- Google Play UGC: https://support.google.com/googleplay/android-developer/answer/9876937
- TikTok Content Posting: https://developers.tiktok.com/products/content-posting-api
- Snap Creative Kit: https://developers.snap.com/snap-kit/creative-kit/overview
- PostHog: https://posthog.com/

# 21. Operating rule

Before adding any feature, ask:

**Does this make ProofMode more entertaining, make participation easier, strengthen identity/status, improve retention, or create distribution?**

If none apply, do not build it yet.
