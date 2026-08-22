# ProofMode 2.0 Upgrade Notes

ProofMode 2.0 turns the original receipt-based accountability app into a multiplayer proof network designed around repeatable challenge launches and user-owned reputation.

## New growth primitives

- **Drops:** public, time-boxed challenge rooms with categories, seat caps, Founder cutoffs, momentum stats, and a Proof Board.
- **Founder status:** awarded from true join order and persisted on a member's public identity.
- **Attributed invites:** every challenge invite can record who recruited the new member.
- **Receipt Passport:** a public profile built only from public challenge activity.
- **Proof Score:** transparent score based on public receipts, verifications, and attributed recruits.
- **Share-native receipts:** Story-sized receipt assets and native Web Share/clipboard fallbacks.
- **Public Drop discovery:** SEO-indexable `/drops`, challenge pages, user Passports, sitemap, and robots metadata.

## Monetization upgrades

- Free / Pro / Creator entitlements are enforced in the database as well as API routes.
- Billing-owned plan state cannot be changed by the authenticated browser role.
- Existing paid subscribers are prevented from accidentally starting a second live subscription.
- Stripe Checkout sessions include an integration identifier for funnel analysis.
- Paid users get Stripe Customer Portal self-service from the dashboard.

## Production hardening added

- Direct membership inserts are removed after migration 002; joins go through `join_challenge_v2`.
- Join requests serialize on the challenge row, preventing concurrent joins from exceeding seat caps.
- Free one-challenge quota creation serializes on the user's profile row, preventing concurrent quota bypass.
- Private invite landings expose safe metadata only.
- Public leaderboard and Passport RPCs expose aggregate/public data only—never private proof storage paths.
- Invite minting requires real membership/ownership.

## Launch strategy

The initial wedge is creator-led run clubs and safe fitness communities because the proof is visual, the activity is naturally social/IRL, and hosts already run recurring challenges. The launch is packaged as **RECEIPT SEASON 001**, seeded through 30–50 micro-creators/community operators before broader expansion to builders and creative cohorts.

See `MARKETING.md` for the complete 21-day launch system and `PRODUCT_V2.md` for the product thesis and next feature sequence.

## Validation status

All 41 TypeScript/TSX implementation files parse/transpile cleanly with the TypeScript compiler API available in this environment. A full dependency install/build could not be run because npm registry access is unavailable here; run `npm install`, `npm run typecheck`, and `npm run build` in a networked CI/dev environment before deployment.
