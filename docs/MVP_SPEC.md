# ProofMode 3.0 — MVP Product Specification

## Mobile navigation
**Home | Explore | + | Crews | You**

## Home / ProofTV
Full-screen vertical feed.

Card:
- avatar/handle/status
- content-kind chip
- Drop
- media
- caption
- proof/streak metadata
- reactions
- comments
- share
- primary CTA

Kinds and default CTAs:
- Proof → Beat me / Try it
- Fail → Run it back
- Almost → Try it
- Comeback → Follow journey
- PR → Beat it
- Reset → Start with me

Rules:
- video pauses offscreen
- preload only nearby items
- audio preference persists
- no blank new-user feed
- report/block/not-interested on every public user-generated item

## Explore
Search people, Drops, templates and categories.

Server-controlled sections:
Trending, Easy Wins, Start Today, With Friends, 7 Days, 30 Days, Fitness, Build, Create, Learn, Funny.

Template detail:
- promise
- difficulty
- time/day
- duration
- proof method
- example
- safety note
- participant count
- Join / Start own / Watch

## Create
State machine:
`choose_kind → choose_context → capture → edit → upload → process → moderate → publish`

If app closes, retain draft metadata.
If upload fails, offer retry.
Verified proof is a separate ledger object from a public post.

## Drop
- hero
- Join / Watch
- creator
- rule
- momentum
- leaders
- latest posts
- Journey highlights
- share/report

## Journey
- user
- Drop
- attempt number
- status
- current/best streak
- chronological posts
- Start from Day 1
- Follow Journey
- Join same Drop

## Crews
MVP:
- activity
- member list
- leaderboard
- invite
- simple room thread

No random/anonymous chat or full DM system.

## Passport
- Proof Score
- verified proofs
- completed Drops
- best/current streak
- founder count
- recruits
- comeback count
- Highlights/Journeys/Trophy Case/Posts

Proof+ changes presentation, not reputation.

## Reactions
Proven / Respect / LOL / Run It Back / I’m Next

## Comments
Text, mentions, delete own, report, block author.

## Authentication
Apple, Google, email magic-link fallback.
Stable internal UUID independent of provider.
Delay notification/contact permissions until context exists.

## Entitlements
Canonical:
- `proof_plus`
- `creator`
- `black`

Black ⇒ Creator ⇒ Proof+.

Client never writes authoritative entitlement.

## Core events

Acquisition:
landing_view, app_open_from_link, signup_started, signup_completed

Activation:
interest_selected, first_feed_view, drop_joined, drop_watched, first_post_published, first_proof_verified

Engagement:
feed_impression, feed_video_complete, reaction_created, comment_created, journey_followed, creator_followed, share_started, share_completed, invite_claimed

Monetization:
paywall_view, purchase_started, purchase_success, restore_success, subscription_cancelled, subscription_renewed

Safety:
content_hidden, report_submitted, user_blocked

## Required new backend objects
posts, journeys, follows, watched_challenges, post_reactions, comments, user_interests, challenge_templates, blocks, reports, moderation_actions, push_tokens, notification_preferences, media_assets.

## Quality gates
- public shared content can be viewed without login
- deep link resolves exact content
- upload has visible progress/recovery
- report/block works everywhere it is needed
- free product is fully usable
- restore purchases exists
- server validates entitlements
- all key funnel events are instrumented
