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
