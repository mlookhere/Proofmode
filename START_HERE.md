# START HERE — ProofMode 3.0

## Zero-context recovery comes first

Before relying on conversation history, open the GitHub Issue titled **`[CONTROL] ProofMode current repository state`**. It is the canonical project handoff and is automatically synchronized from repository/Issue/PR/CI state.

Then:

1. open the active controlling Issue listed there;
2. read its **Managed handoff state**;
3. confirm the named branch and PR;
4. read `docs/DEVELOPMENT_STATUS.md` and `docs/MASTER_PLAN.md` only after the Issue state is understood.

Repository workflow details live in `docs/CONTROL_PLANE.md`.

## Product north star

**ProofMode is the participation network.**

The feed must be entertaining enough to open with no intention to post, while every strong post offers a doorway into trying something.

`Watch → Try → Post → Verify → Share/Challenge → Recruit → Return`

## Branch and Issue rule

- `main` is released/production history.
- `dev` is the integration branch.
- New phases/modules use a `type:feature` Issue and `work/<issue>-<slug>` branch into `dev`.
- Bugs use a `type:bug` Issue and `fix/<issue>-<slug>` branch into `dev`.
- Releases use a `type:release` Issue and a `dev → main` PR.
- The controlling Issue remains open through integration and closes only when its release reaches `main`.
- Native GitHub branch protection is unavailable on the current private-repository plan. Run `scripts/setup-control-plane.ps1` once per checkout to activate the local pre-push guard; GitHub Actions audits every resulting push to `dev` and `main` and records any bypass as a control violation Issue.

## Execute from the current checkpoint

The exact checkpoint is synchronized into the control Issue from `docs/DEVELOPMENT_STATUS.md`. At the current baseline:

1. **Auth external gates:** configure/test hosted magic-link redirect, then Apple/Google provider integration and physical-device testing.
2. **Media/Create:** camera/library → signed upload → processing → moderation → publish recovery.
3. **Social:** reactions, comments, follows, Crew data, report, and block.
4. **Proof/Journey/Passport:** verified ledger, streak/reset/comeback rules, history.
5. **Sharing + push:** canonical links, hosted association files, native share, attribution, then contextual notifications.
6. **Monetization:** RevenueCat entitlements/paywalls/restore; keep Black private/server-owned.
7. **Closed alpha:** seed content and small real communities, then fix activation, retention, safety, and media-cost issues before broad launch.

## Production rule

Do not confuse “viral features” with a viral product. The team earns distribution by making:

1. first session entertaining,
2. first participation obvious,
3. first post easy,
4. first share socially natural,
5. return visits story-driven.

## Before public launch

Every P0 box in `docs/QA_RELEASE_CHECKLIST.md` must be complete.
