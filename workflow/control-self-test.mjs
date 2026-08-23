import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const config = JSON.parse(await read(".proofmode-workflow.json"));
assert(config.branches.integration === "dev", "Integration branch must be dev");
assert(config.branches.production === "main", "Production branch must be main");
assert(config.github.control_issue_title === "[CONTROL] ProofMode current repository state", "Unexpected control Issue title");
assert(config.github.expected_owner === "mlookhere" && config.github.expected_repository === "Proofmode", "Control plane repository identity mismatch");

const ci = await read(".github/workflows/ci.yml");
assert(ci.includes("branches: [dev, main]"), "CI must target dev and main");
for (const check of ["name: Foundation", "name: Database", "name: Mobile", "name: Web"]) assert(ci.includes(check), `Missing stable CI check name: ${check}`);

const guard = await read(".github/workflows/pr-guard.yml");
assert(guard.includes("pull_request_target"), "PR guard must run from trusted base workflow");
assert(guard.includes("node workflow/validate-pr.mjs"), "PR guard is not wired to validate-pr.mjs");
assert(guard.includes("name: PR metadata"), "PR guard check name must remain stable for branch protection");

const sync = await read(".github/workflows/control-sync.yml");
for (const trigger of ["issues:", "pull_request_target:", "workflow_run:"]) assert(sync.includes(trigger), `Control sync is missing ${trigger}`);
assert(sync.includes("node workflow/control-sync.mjs"), "Control Issue synchronization step is missing");
assert(sync.includes("node workflow/handle-pr-state.mjs"), "PR lifecycle handler is missing");

const controlSync = await read("workflow/control-sync.mjs");
assert(controlSync.includes("const branchByIssue = new Map()"), "Control sync does not index Issue-backed branches");
assert(controlSync.includes("branchByIssue.get(issue.number)"), "Control sync does not use pre-PR Issue branch state");
assert(controlSync.includes("/^(?:work|fix)\\/(\\d+)-"), "Control sync branch discovery does not enforce Issue-backed branch naming");

for (const template of ["task.yml", "bug.yml", "release.yml"]) {
  const body = await read(`.github/ISSUE_TEMPLATE/${template}`);
  assert(body.includes("<!-- state:start -->") && body.includes("<!-- state:end -->"), `${template} is missing managed handoff markers`);
}

const prTemplate = await read(".github/PULL_REQUEST_TEMPLATE.md");
for (const heading of ["## Issue", "## Result", "## Implementation", "## Verification", "## Risk", "## Remaining work"]) assert(prTemplate.includes(heading), `PR template is missing ${heading}`);

const startHere = await read("START_HERE.md");
assert(startHere.includes("[CONTROL] ProofMode current repository state"), "START_HERE does not point zero-context sessions to the control Issue");
assert(startHere.includes("work/<issue>-<slug>") && startHere.includes("fix/<issue>-<slug>"), "START_HERE is missing Issue-backed branch conventions");

const docs = await read("docs/CONTROL_PLANE.md");
assert(docs.includes("Conversation history is never the canonical source"), "Control-plane documentation must define repository truth");

console.log("ProofMode control-plane validation passed.");
