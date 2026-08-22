# ProofMode — Cross-Platform Integration Plan

The rule: other social networks are distribution, not the home of ProofMode's social graph.

## Phase 0 — universal sharing (MVP)
Build this before any platform-specific posting API:
- canonical HTTPS links
- iOS Universal Links
- Android App Links
- Open Graph previews
- native mobile share sheet
- image/video export variants
- copied challenge caption
- referral token / source attribution

Why first: it works across Messages, WhatsApp, Discord, Instagram, TikTok, Snapchat and other destinations with one implementation.

## Phase 1 — Snapchat Creative Kit
Good fit for friend-to-friend challenge behavior. Use platform-compliant media/stickers and deep-link back where permitted.

## Phase 2 — TikTok Content Posting
Add after the app has real content and the integration can pass TikTok's review/audit requirements. Keep Direct Post assets platform-compliant; do not force promotional watermarks into content sent through Direct Post.

## Phase 3 — Instagram creator workflow
For eligible professional accounts, explore supported publishing workflows. Regular users keep the native-share/export path.

## Phase 4 — YouTube / Shorts
Only if creator demand and format length justify the integration. Do not build merely to have another logo on the integrations page.

## External embeds
Do not fill ProofTV with external-platform embeds. They create a retention leak and make ProofMode feel like an aggregator.

Allow embeds/links narrowly for:
- a creator's Drop intro/context,
- creator profile portfolio/context,
- “this external post started the challenge” attribution.

The participation action and comments remain native to ProofMode.

## Deep-link route contract
- `/p/:postId` — post
- `/r/:receiptId` — receipt/share object
- `/c/:slug` — Drop/challenge
- `/j/:journeyId` — Journey
- `/u/:handle` — Passport
- `/invite/:code` — attributed invite

Each path must render useful public-safe web content when the app is not installed.
