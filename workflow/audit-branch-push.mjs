import { readFile } from "node:fs/promises";
import {
  getIssue,
  github,
  issueFromBranch,
  issueFromText,
  labelsOf,
  paginate,
  repository,
} from "./control-lib.mjs";

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) throw new Error("GITHUB_EVENT_PATH is required");

const event = JSON.parse(await readFile(eventPath, "utf8"));
const repo = repository();
const branch = String(event.ref || "").replace("refs/heads/", "");
const sha = event.after;

if (!sha || !["dev", "main"].includes(branch)) {
  console.log("No controlled branch push to audit.");
  process.exit(0);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function associatedPulls() {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const pulls = await github(`/repos/${repo}/commits/${sha}/pulls?per_page=100`);
    if (pulls.length || attempt === 5) return pulls;
    await sleep(2000);
  }
  return [];
}

async function issueHasType(number, type) {
  if (!number) return false;
  try {
    return labelsOf(await getIssue(number)).has(type);
  } catch {
    return false;
  }
}

const pulls = (await associatedPulls()).filter((pr) => pr.merged_at);
let valid = false;
let explanation = "";

if (branch === "dev") {
  for (const pr of pulls) {
    const issueNumber = issueFromBranch(pr.head?.ref || "") || issueFromText(pr.body || "");
    const validHead = /^(?:work|fix)\/\d+-[a-z0-9][a-z0-9-]*$/.test(pr.head?.ref || "");
    const validType = await Promise.any([
      issueHasType(issueNumber, "type:feature"),
      issueHasType(issueNumber, "type:bug"),
      issueHasType(issueNumber, "type:maintenance"),
    ].map(async (value) => value)).catch(() => false);
    if (pr.base?.ref === "dev" && validHead && validType) {
      valid = true;
      explanation = `PR #${pr.number} ${pr.head.ref} -> dev`;
      break;
    }
  }
} else {
  for (const pr of pulls) {
    const issueNumber = issueFromText(pr.body || "");
    if (pr.base?.ref === "main" && pr.head?.ref === "dev" && await issueHasType(issueNumber, "type:release")) {
      valid = true;
      explanation = `release PR #${pr.number} dev -> main`;
      break;
    }
  }
}

if (valid) {
  console.log(`Branch policy audit passed: ${explanation}.`);
  process.exit(0);
}

const title = `[CONTROL VIOLATION] Unauthorized ${branch} push`;
const actor = event.sender?.login || process.env.GITHUB_ACTOR || "unknown";
const compare = event.compare || `https://github.com/${repo}/commit/${sha}`;
const body = `## Detected policy bypass\n\nA push reached \`${branch}\` without a matching approved ProofMode PR path. Native GitHub branch protection is unavailable on the current private-repository plan, so this audit is the server-side compensating control.\n\n- Branch: \`${branch}\`\n- Commit: \`${sha}\`\n- Actor: \`${actor}\`\n- Before: \`${event.before || "unknown"}\`\n- Compare: ${compare}\n- Detected: ${new Date().toISOString()}\n\n## Required response\n\nInspect the commit immediately. If it was accidental, restore the branch through the normal Issue-backed PR/release path. Do not close this Issue until repository state is reconciled.\n\n## Managed handoff state\n\n<!-- state:start -->\nUnauthorized or unrecognized push detected on ${branch} at ${sha}. Inspect the commit and reconcile branch history through the normal ProofMode Issue/PR workflow before closing this Issue.\n<!-- state:end -->`;

const openIssues = (await paginate(`/repos/${repo}/issues?state=open`)).filter((issue) => !issue.pull_request);
const existing = openIssues.find((issue) => issue.title === title);
if (existing) {
  await github(`/repos/${repo}/issues/${existing.number}`, {
    method: "PATCH",
    body: JSON.stringify({ body, labels: ["type:maintenance", "state:blocked", "risk:ci"] }),
  });
} else {
  await github(`/repos/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels: ["type:maintenance", "state:blocked", "risk:ci"] }),
  });
}

throw new Error(`ProofMode branch policy violation: ${branch}@${sha} has no approved PR path.`);
