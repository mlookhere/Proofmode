import {
  CONTROL_END,
  CONTROL_START,
  JSON_END,
  JSON_START,
  extractManagedState,
  github,
  labelsOf,
  loadConfig,
  markdownCell,
  paginate,
  replaceBlock,
  repository,
} from "./control-lib.mjs";

const config = await loadConfig();
const repo = repository();
const [owner, name] = repo.split("/");
if (owner !== config.github.expected_owner || name !== config.github.expected_repository) {
  throw new Error(`Control plane is configured for ${config.github.expected_owner}/${config.github.expected_repository}, not ${repo}`);
}

const labelDefinitions = {
  "type:bug": ["d73a4a", "Defect or regression"],
  "type:feature": ["0e8a16", "New phase/module behavior"],
  "type:maintenance": ["6f42c1", "Maintenance or repository control"],
  "type:release": ["5319e7", "Release control Issue"],
  "state:ready": ["bfdadc", "Ready to start"],
  "state:active": ["fbca04", "Implementation active"],
  "state:blocked": ["b60205", "Blocked"],
  "state:review": ["1d76db", "Pull request review"],
  "state:release-ready": ["0e8a16", "Integrated in dev and waiting for release"],
  "state:shipped": ["8250df", "Released to main"],
  "risk:database": ["b60205", "Database or migration risk"],
  "risk:security": ["b60205", "Security or authorization risk"],
  "risk:deployment": ["d93f0b", "Deployment or infrastructure risk"],
  "risk:dependencies": ["d93f0b", "Dependency manifest or lockfile risk"],
  "risk:ci": ["d93f0b", "CI or workflow-policy risk"],
  "risk:large-change": ["d93f0b", "Change exceeds normal review-size budget"],
};

for (const [label, [color, description]] of Object.entries(labelDefinitions)) {
  try {
    await github(`/repos/${repo}/labels`, { method: "POST", body: JSON.stringify({ name: label, color, description }) });
  } catch (error) {
    if (!String(error).includes("already_exists") && !String(error).includes("Validation Failed")) throw error;
    await github(`/repos/${repo}/labels/${encodeURIComponent(label)}`, {
      method: "PATCH",
      body: JSON.stringify({ color, description }),
    });
  }
}

const issues = (await paginate(`/repos/${repo}/issues?state=open`)).filter((issue) => !issue.pull_request);
let control = issues.find((issue) => issue.title === config.github.control_issue_title);
if (!control) {
  control = await github(`/repos/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({
      title: config.github.control_issue_title,
      labels: ["type:maintenance"],
      body: `${CONTROL_START}\n_Control state has not synchronized yet._\n${CONTROL_END}\n\n## Current hazards\n\nNone recorded.`,
    }),
  });
}

try {
  const node = await github("/graphql", {
    method: "POST",
    body: JSON.stringify({ query: `query { repository(owner: \"${owner}\", name: \"${name}\") { issue(number: ${control.number}) { id } } }` }),
  });
  const issueId = node?.data?.repository?.issue?.id;
  if (issueId) {
    await github("/graphql", {
      method: "POST",
      body: JSON.stringify({ query: `mutation { pinIssue(input: {issueId: \"${issueId}\"}) { issue { number } } }` }),
    });
  }
} catch (error) {
  console.warn(`Control Issue pinning skipped: ${error.message}`);
}

const branches = {};
for (const branch of [config.branches.production, config.branches.integration]) {
  try {
    const data = await github(`/repos/${repo}/branches/${encodeURIComponent(branch)}`);
    branches[branch] = data.commit.sha;
  } catch {
    branches[branch] = null;
  }
}

async function textFile(path, ref) {
  try {
    const data = await github(`/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`);
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch {
    return "";
  }
}

const integration = config.branches.integration;
const production = config.branches.production;
const statusText = await textFile("docs/DEVELOPMENT_STATUS.md", integration) || await textFile("docs/DEVELOPMENT_STATUS.md", production);
const mobileDev = JSON.parse((await textFile("mobile/package.json", integration)) || "{}");
const mobileProd = JSON.parse((await textFile("mobile/package.json", production)) || "{}");
const tags = await github(`/repos/${repo}/tags?per_page=20`);
const latestTag = tags.find((tag) => /^v\d+\.\d+\.\d+$/.test(tag.name))?.name || null;

const pulls = await paginate(`/repos/${repo}/pulls?state=open`);
const prByIssue = new Map();
for (const pr of pulls) {
  const branchMatch = pr.head.ref.match(/^(?:work|fix)\/(\d+)-/);
  const bodyMatch = (pr.body || "").match(/\b(?:closes|fixes|refs)\s+#(\d+)\b/i);
  const number = Number(branchMatch?.[1] || bodyMatch?.[1] || 0);
  if (number) prByIssue.set(number, pr);
}

async function ciSummary(pr) {
  try {
    const checks = await github(`/repos/${repo}/commits/${pr.head.sha}/check-runs?per_page=100`);
    const values = (checks.check_runs || []).map((check) => check.conclusion || check.status);
    if (!values.length) return "not run";
    if (values.some((value) => ["failure", "cancelled", "timed_out", "action_required"].includes(value))) return "failing";
    if (values.some((value) => ["queued", "in_progress", "waiting", null].includes(value))) return "pending";
    if (values.every((value) => ["success", "neutral", "skipped"].includes(value))) return "passing";
    return "mixed";
  } catch {
    return "unknown";
  }
}

const active = [];
const bugs = [];
for (const issue of issues) {
  if (issue.number === control.number) continue;
  const labels = labelsOf(issue);
  const states = config.github.state_labels.filter((label) => labels.has(label));
  const pr = prByIssue.get(issue.number) || null;
  const row = {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    state: states[0] || "state:unlabeled",
    risks: [...labels].filter((label) => label.startsWith("risk:")),
    type: [...labels].find((label) => label.startsWith("type:")) || "type:unlabeled",
    branch: pr?.head?.ref || null,
    pr: pr ? { number: pr.number, url: pr.html_url, base: pr.base.ref, ci: await ciSummary(pr) } : null,
    handoff: extractManagedState(issue.body || ""),
  };
  active.push(row);
  if (labels.has("type:bug")) bugs.push(row);
}

active.sort((a, b) => a.number - b.number);
bugs.sort((a, b) => a.number - b.number);
const rowLimit = config.tracking.control_issue_max_active_rows;
const activeRows = active.slice(0, rowLimit).map((item) =>
  `| [#${item.number}](${item.url}) ${markdownCell(item.title)} | ${item.branch ? `\`${markdownCell(item.branch)}\`` : "—"} | ${markdownCell(item.state.replace("state:", ""))} | ${item.risks.map((risk) => risk.replace("risk:", "")).join(", ") || "—"} | ${item.pr ? `[#${item.pr.number}](${item.pr.url}) / ${item.pr.ci}` : "—"} |`
).join("\n") || "| — | — | no active work | — | — |";
const bugRows = bugs.map((item) => `| [#${item.number}](${item.url}) ${markdownCell(item.title)} | ${markdownCell(item.state.replace("state:", ""))} | ${item.pr ? `[#${item.pr.number}](${item.pr.url}) / ${item.pr.ci}` : "—"} |`).join("\n") || "| — | no open bugs | — |";
const handoffLimit = config.tracking.handoff_max_chars;
const handoffs = active.filter((item) => ["state:active", "state:blocked", "state:review", "state:release-ready"].includes(item.state)).map((item) => `### #${item.number} — ${item.title}\n\n${item.handoff.slice(0, handoffLimit)}`).join("\n\n") || "No active handoffs.";
const releaseIssue = [...active].reverse().find((item) => item.type === "type:release") || null;
const stateJson = {
  schema: 1,
  repository: repo,
  production_branch: production,
  integration_branch: integration,
  production_sha: branches[production],
  integration_sha: branches[integration],
  released_tag: latestTag,
  released_mobile_version: mobileProd.version || null,
  integration_mobile_version: mobileDev.version || null,
  current_release_issue: releaseIssue?.number || null,
  active_issues: active.map(({ number, title, state, type, branch, pr, risks }) => ({ number, title, state, type, branch, pr, risks })),
  open_bugs: bugs.map(({ number, title, state, branch, pr }) => ({ number, title, state, branch, pr })),
  synchronized_at: new Date().toISOString(),
};

const controlBlock = `${CONTROL_START}
# ProofMode control plane

This Issue is the canonical zero-context handoff. Read it first, then read the active controlling Issue before changing code.

## Recovery rule

1. Read this control Issue.
2. Read the active Issue under **Active work** and its **Managed handoff state**.
3. Product phases/modules use \`work/<issue>-<slug>\` branches into \`${integration}\`.
4. Bugs use \`fix/<issue>-<slug>\` branches into \`${integration}\`.
5. Releases use a \`type:release\` Issue and a \`${integration} → ${production}\` PR.
6. Do not treat chat history as project truth when it conflicts with Issues, Git, CI, or the live database.

## Branch and release state

- Production: \`${production}@${branches[production]?.slice(0, 12) || "unavailable"}\`
- Integration: \`${integration}@${branches[integration]?.slice(0, 12) || "unavailable"}\`
- Latest release tag: \`${latestTag || "none"}\`
- Released mobile version: \`${mobileProd.version || "unknown"}\`
- Integration mobile version: \`${mobileDev.version || "unknown"}\`
- Current release Issue: ${releaseIssue ? `[#${releaseIssue.number}](${releaseIssue.url}) ${releaseIssue.title}` : "none"}

## Active work

| Issue | Branch | State | Risk | PR / CI |
|---|---|---|---|---|
${activeRows}

## Open bugs

| Issue | State | PR / CI |
|---|---|---|
${bugRows}

## Active handoffs

${handoffs}

## Project checkpoint from \`${integration}\`

${statusText || "_No DEVELOPMENT_STATUS.md available._"}

## Machine-readable state

${JSON_START}
\`\`\`json
${JSON.stringify(stateJson, null, 2)}
\`\`\`
${JSON_END}

_Last synchronized automatically by ProofMode control sync._
${CONTROL_END}`;

const nextBody = replaceBlock(control.body || "", CONTROL_START, CONTROL_END, controlBlock);
await github(`/repos/${repo}/issues/${control.number}`, {
  method: "PATCH",
  body: JSON.stringify({ body: nextBody, labels: ["type:maintenance"] }),
});
console.log(`Synchronized control Issue #${control.number}.`);
