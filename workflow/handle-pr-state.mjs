import { readFile } from "node:fs/promises";
import {
  getIssue,
  github,
  issueFromBranch,
  issueFromText,
  labelsOf,
  loadConfig,
  section,
  setIssueStateLabel,
  repository,
} from "./control-lib.mjs";

const config = await loadConfig();
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const pr = event.pull_request;
if (!pr) process.exit(0);
const repo = repository();
const integration = config.branches.integration;
const production = config.branches.production;
const base = pr.base.ref;
const issueNumber = issueFromText(pr.body || "") || issueFromBranch(pr.head.ref);
if (!issueNumber) {
  console.log("No controlling Issue could be inferred.");
  process.exit(0);
}

const action = event.action;
if (["opened", "reopened", "ready_for_review"].includes(action)) {
  await setIssueStateLabel(issueNumber, "state:review", config);
  process.exit(0);
}
if (action === "converted_to_draft") {
  await setIssueStateLabel(issueNumber, "state:active", config);
  process.exit(0);
}
if (action !== "closed") process.exit(0);

if (base === integration) {
  await setIssueStateLabel(issueNumber, pr.merged ? "state:release-ready" : "state:active", config);
  process.exit(0);
}
if (base !== production) process.exit(0);

if (!pr.merged) {
  await setIssueStateLabel(issueNumber, "state:active", config);
  process.exit(0);
}

const releaseIssue = await getIssue(issueNumber);
const included = section(releaseIssue.body || "", "Included Issues");
const referenced = [...included.matchAll(/#(\d+)/g)].map((match) => Number(match[1])).filter((number) => number !== issueNumber);
for (const number of [...new Set(referenced)]) {
  try {
    const issue = await getIssue(number);
    if (issue.state !== "open") continue;
    const labels = labelsOf(issue);
    const states = new Set(config.github.state_labels);
    const next = [...labels].filter((label) => !states.has(label));
    next.push("state:shipped");
    await github(`/repos/${repo}/issues/${number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", state_reason: "completed", labels: [...new Set(next)] }),
    });
  } catch (error) {
    console.warn(`Could not close included Issue #${number}: ${error.message}`);
  }
}
const releaseLabels = labelsOf(releaseIssue);
const states = new Set(config.github.state_labels);
const next = [...releaseLabels].filter((label) => !states.has(label));
next.push("state:shipped");
await github(`/repos/${repo}/issues/${issueNumber}`, {
  method: "PATCH",
  body: JSON.stringify({ state: "closed", state_reason: "completed", labels: [...new Set(next)] }),
});
