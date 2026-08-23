# ProofMode repository control plane

ProofMode uses GitHub Issues, branches, pull requests, and CI as the durable project memory. Conversation history is never the canonical source of project state.

## Zero-context recovery

1. Open the Issue titled **`[CONTROL] ProofMode current repository state`**.
2. Read its branch/release state, active-work table, open-bug table, project checkpoint, and machine-readable JSON block.
3. Open the controlling Issue for the active work and read **Managed handoff state**.
4. Confirm the branch and PR named there before modifying code.

The control Issue is synchronized automatically after Issue lifecycle changes, PR lifecycle changes, and completion of ProofMode CI/PR-guard runs.

## Branch model

- `main`: released/production history only.
- `dev`: integration branch for completed work waiting for a release.
- `work/<issue>-<slug>`: feature, phase, module, or maintenance implementation.
- `fix/<issue>-<slug>`: bug/regression implementation.

New product work and fixes merge to `dev`. A release Issue controls the `dev -> main` PR.

## Soft branch enforcement

Native GitHub protected branches are unavailable while this repository is private on the current GitHub plan. ProofMode therefore uses compensating controls rather than pretending `dev` and `main` are protected.

- `scripts/setup-control-plane.ps1` activates the repository-owned `.githooks/pre-push` hook.
- The pre-push hook rejects local direct pushes to `dev` and `main`.
- `.github/workflows/branch-policy-audit.yml` runs after every push to `dev` or `main`.
- A `dev` push is valid only when GitHub associates it with a merged PR targeting `dev` from an Issue-backed `work/` or `fix/` branch whose controlling Issue has an allowed work type.
- A `main` push is valid only when GitHub associates it with a merged `dev -> main` PR controlled by a `type:release` Issue.
- An unrecognized push fails the audit and creates or updates a durable `[CONTROL VIOLATION]` maintenance Issue so the canonical control Issue surfaces the bypass.

This cannot stop an intentional server-side bypass before the commit lands. It prevents normal accidental local pushes and makes any remote bypass immediately visible and durable. The normal workflow remains Issues -> work/fix branch -> PR -> CI -> `dev` -> release Issue -> `main`.

An emergency local bypass exists only for recovery work:

```powershell
$env:PROOFMODE_ALLOW_DIRECT_PUSH = "1"
git push ...
Remove-Item Env:PROOFMODE_ALLOW_DIRECT_PUSH
```

Use it only when the repository is already being repaired and record the reason in the controlling maintenance Issue.

## Issue model

### Phase/module task

Use `type:feature` for new behavior and `type:maintenance` when repository/infrastructure work does not change product behavior. Keep the Issue open after it merges to `dev`; automation moves it to `state:release-ready`. The Issue closes only after the release PR reaches `main`.

### Bug

Every reproducible bug gets a `type:bug` Issue before implementation. The Issue stores reproduction, evidence, expected behavior, regression coverage, and the current handoff. Fix branches use `fix/<issue>-<slug>` and merge to `dev` unless a separately controlled emergency-release process is explicitly created.

### Release

A `type:release` Issue lists every included release-ready Issue in its **Included Issues** section. A production PR must come from `dev`. When it merges, the lifecycle workflow closes the release Issue and the included shipped Issues with `state:shipped`.

## Managed handoff state

Every task/bug/release Issue contains:

```text
<!-- state:start -->
Current implementation state, verified facts, blockers, next action, and anything a fresh session needs.
<!-- state:end -->
```

Replace this section as facts change. Do not append a diary of obsolete session notes.

## PR guard

PRs into `dev` must:

- use `work/<issue>-<slug>` or `fix/<issue>-<slug>`;
- link the same Issue with `Closes #N`, `Fixes #N`, or `Refs #N`;
- use the expected Issue type;
- carry risk labels required by changed paths;
- contain the required PR-template sections.

PRs into `main` must come from `dev` and reference an open `type:release` Issue.

## Risk labels

Risk labels are deterministic and configured in `.proofmode-workflow.json`:

- `risk:ci`
- `risk:database`
- `risk:security`
- `risk:deployment`
- `risk:dependencies`
- `risk:large-change`

The PR guard fails when changed paths require a risk label that is absent from the controlling Issue.

## Control Issue contents

The synchronized block includes:

- production/integration SHAs;
- released and integration mobile versions;
- latest semantic release tag;
- active task/bug/release Issues;
- inferred implementation branch and PR;
- aggregate CI status from PR head checks;
- open bugs;
- managed handoff text for active work;
- the current `docs/DEVELOPMENT_STATUS.md` from `dev`;
- a machine-readable JSON state block.

This is intentionally enough information for a new development session to recover without previous chat context.
