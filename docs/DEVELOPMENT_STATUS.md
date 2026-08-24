# ProofMode Development Status

This file is a durable engineering checkpoint for repository work. GitHub Issues, PRs, CI, migrations, and staging remain canonical when this summary conflicts with live control-plane state.

## Production baseline

- Production branch: `main`
- Production release: v0.9.0
- v0.9.0 shipped through release Issue #19 / PR #20.
- Core v0.9.0 scope includes mobile auth/session, live feed pagination, Explore/Join/Watch, direct image/video upload with retry/recovery, media lifecycle/moderation integration, and staging verification through migration `009`.

## Integrated on `dev`

### Social Actions MVP

Social Actions was implemented in Issue #21 / PR #22 and is integrated on `dev` at squash commit `1fdddf46e62f8de0c833606c203e6c2fdbb62320`.

Verified integration includes:

- follow/unfollow;
- exactly five canonical reactions;
- comments with own-delete;
- block/unblock;
- post/comment/user/Drop reports;
- existing challenge membership reused for Crew rooms, members, activity, leaderboard, messages, and invites;
- RPC-owned social mutations;
- privileged Social implementations kept in `private` with narrow public invoker wrappers;
- block-aware feed/profile/comment/Crew aggregate visibility;
- migrations `010`–`014` applied to staging;
- 47/47 hosted Social Actions rollback-smoke assertions passed;
- rollback left no staging fixtures;
- Social-specific advisor findings from the initial staging pass were fixed by `014_social_performance_hardening.sql`;
- final integration CI passed Foundation, Database, Mobile, Web, and repository control checks.

Issue #21 is release-ready. This work is integrated but not represented as a new production release yet.

## Active development

### Journey, Proof Ledger, and Passport MVP — Issue #23

Branch: `work/23-journey-proof-passport`

Current scope:

- reuse existing `journeys`, `proofs`, `verifications`, `posts`, challenge membership, and media lifecycle;
- one race-safe active Journey attempt per user/Drop;
- retry-safe Reset that preserves prior attempts;
- publication/moderation-owned linking of eligible Proof/Comeback/PR posts to the credibility ledger;
- Fail/Almost/Reset never silently count as proof receipts;
- Journey follows with block-aware visibility;
- challenge-member verification RPC separate from the social Proven reaction;
- derived verified count, current/best streak, completed Drops, comeback count, Journey/Trophy history, recent posts, and Proof Score;
- paid/status plans never modify earned reputation;
- secure Journey assignment in the v3 media-create lifecycle;
- mobile Journey, Drop continuation/Run It Back, verification, and Passport surfaces.

Work is currently implementation-only. Migration `015_journey_proof_passport.sql` and `006_journey_proof_passport.test.sql` are under branch validation and have not been applied to staging. Integration is not complete until CI, hosted staging verification/advisors, control-plane review, and merge to `dev` all pass.

## Staging

Connected Supabase staging project currently has migrations `001` through `014` applied. Do not apply Journey migration `015` until the exact work-branch head passes the Database CI gate.

## Repository workflow

- `dev` is the integration branch.
- `main` is the production branch.
- Feature work is Issue-backed and uses a work branch + PR into `dev`.
- Required checks: PR metadata, Foundation, Database, Mobile, Web.
- Staging migrations are forward-only after application; never rewrite a migration already applied to staging.
- Large-change threshold from `.proofmode-workflow.json`: more than 80 changed files or more than 4,000 changed lines.
- GitHub control Issue #1 remains the canonical repository-state view.
