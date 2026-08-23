import { readFile } from "node:fs/promises";
import {
  getIssue,
  issueFromBranch,
  issueFromText,
  labelsOf,
  loadConfig,
  matchesAny,
  paginate,
  repository,
} from "./control-lib.mjs";

const config = await loadConfig();
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const pr = event.pull_request;
if (!pr) throw new Error("pull_request event required");
const repo = repository();
const base = pr.base.ref;
const head = pr.head.ref;
const bodyIssue = issueFromText(pr.body || "");
const branchIssue = issueFromBranch(head);
const failures = [];
const integration = config.branches.integration;
const production = config.branches.production;

if (!bodyIssue) failures.push("PR body must contain `Closes #N`, `Fixes #N`, or `Refs #N`.");
if (base === integration) {
  if (!/^(work|fix)\/\d+-[a-z0-9][a-z0-9-]*$/.test(head)) {
    failures.push(`PRs into ${integration} must use work/<issue>-<slug> or fix/<issue>-<slug>.`);
  }
  if (bodyIssue && branchIssue !== bodyIssue) failures.push(`Branch Issue #${branchIssue || "?"} does not match PR body Issue #${bodyIssue}.`);
} else if (base === production) {
  if (head !== integration) failures.push(`Production PRs must come from ${integration}; received ${head}.`);
} else {
  failures.push(`Unsupported base branch ${base}; expected ${integration} or ${production}.`);
}

let issueLabels = new Set();
if (bodyIssue) {
  const issue = await getIssue(bodyIssue);
  issueLabels = labelsOf(issue);
  if (issue.state !== "open") failures.push(`Controlling Issue #${bodyIssue} must remain open until release.`);
  if (base === integration) {
    if (issueLabels.has("type:release")) failures.push("A task PR into dev cannot use a release Issue.");
    if (head.startsWith("fix/") && !issueLabels.has("type:bug")) failures.push(`fix/ branches require Issue #${bodyIssue} to have type:bug.`);
    if (head.startsWith("work/") && !["type:feature", "type:maintenance"].some((label) => issueLabels.has(label))) failures.push(`work/ branches require Issue #${bodyIssue} to have type:feature or type:maintenance.`);
  }
  if (base === production && !issueLabels.has("type:release")) failures.push(`Production PR requires Issue #${bodyIssue} to have type:release.`);
}

const files = await paginate(`/repos/${repo}/pulls/${pr.number}/files`);
const paths = files.map((file) => file.filename);
for (const [risk, patterns] of Object.entries(config.github.risk_paths)) {
  if (paths.some((path) => matchesAny(path, patterns)) && !issueLabels.has(risk)) {
    failures.push(`Changed paths require controlling Issue #${bodyIssue || "?"} to carry ${risk}.`);
  }
}
const changedLines = files.reduce((sum, file) => sum + Number(file.additions || 0) + Number(file.deletions || 0), 0);
if ((files.length > config.tracking.max_pr_files || changedLines > config.tracking.max_pr_changed_lines) && !issueLabels.has("risk:large-change")) {
  failures.push(`Large PR (${files.length} files / ${changedLines} changed lines) requires risk:large-change.`);
}

const requiredSections = ["## Issue", "## Result", "## Implementation", "## Verification", "## Risk", "## Remaining work"];
for (const section of requiredSections) if (!(pr.body || "").includes(section)) failures.push(`PR body is missing ${section}.`);

if (failures.length) {
  console.error("ProofMode PR metadata validation failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`PR #${pr.number} is correctly controlled by Issue #${bodyIssue}.`);
