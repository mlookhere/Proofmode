# ProofMode — Things Easy to Miss Before Scale

These are not glamorous features, but omitting them can stop adoption, store approval, safety, or economics.

## Product / trust
- account deletion and export
- username/report/block recovery flows
- deleted/blocked user behavior across old comments/shares
- content ownership/IP complaint process
- creator/community moderator roles
- private Crew invitation abuse controls
- accessibility: captions, contrast, screen reader labels, reduced motion
- localization-ready strings/data model
- age declaration and youth-safety policy; decide launch age strategy deliberately
- consent/privacy for photos/video of other people
- EXIF/location stripping or explicit opt-in location handling

## UGC safety
- published Community Guidelines
- in-app report/block
- moderator queue + audit log
- escalation runbook
- prohibited challenge taxonomy
- keyword/risk heuristics as assistive signals, never the only moderation layer
- automated image/video moderation provider abstraction later
- creator moderation tools before creators can run very large rooms

## Music / media rights
Do not ship a “popular music library” without licensing rights. For MVP, let users record original/audio-cleared clips and let destination platforms add their own licensed music after export where supported. Build a licensed catalog only with a real rights partner/business case.

## Stores / billing
- Apple/Google developer accounts
- privacy nutrition/data-safety declarations
- native subscription products and review metadata
- purchase restore/manage subscription
- web/external payment flows reviewed against current storefront/region policies
- refunds/support process
- taxes/accounting for web revenue

## Operations
- business entity/banking/accounting
- trademark/name/domain clearance
- Terms, Privacy, Guidelines drafted/reviewed for actual data flows
- DMCA/IP contact/process where applicable
- support/help center
- status page/incident comms
- backups + restore drills
- database migration rollback strategy
- key rotation and offboarding
- abuse/spam rate limits
- spend alerts and quotas

## Growth
- seed supply before demand
- creator CRM and relationship owner
- content programming calendar
- community managers/moderators for flagship Drops
- attribution that survives deep link → install → auth
- channel-specific creative measurement
- App Store/Play ratings/review support flow after value moments, not at first launch

## Scale triggers — do not build early
Add a dedicated feed/search/queue service only when observed data justifies it. Start with Postgres + simple job mechanisms. Premature distributed architecture increases cost and slows iteration.

## Contacts / friend finding
Do **not** make broad contacts access part of MVP onboarding. Start with share sheet, invite links, usernames and optional manual friend discovery. Contacts access adds privacy/permission friction and platform-policy obligations; only add it after a clear retention benefit is measured and the current Apple/Google requirements are reviewed.
