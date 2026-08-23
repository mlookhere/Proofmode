import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const STATE_START = "<!-- state:start -->";
export const STATE_END = "<!-- state:end -->";
export const CONTROL_START = "<!-- proofmode-control:start -->";
export const CONTROL_END = "<!-- proofmode-control:end -->";
export const JSON_START = "<!-- proofmode-state-json:start -->";
export const JSON_END = "<!-- proofmode-state-json:end -->";

export async function loadConfig() {
  return JSON.parse(await readFile(resolve(".proofmode-workflow.json"), "utf8"));
}

export function repository() {
  const value = process.env.GITHUB_REPOSITORY;
  if (!value || !value.includes("/")) throw new Error("GITHUB_REPOSITORY is required");
  return value;
}

export function token() {
  const value = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!value) throw new Error("GH_TOKEN or GITHUB_TOKEN is required");
  return value;
}

export async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token()}`,
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || `${response.status} ${response.statusText}`;
    throw new Error(`${options.method || "GET"} ${path}: ${message}`);
  }
  return data;
}

export async function paginate(path) {
  const separator = path.includes("?") ? "&" : "?";
  const rows = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await github(`${path}${separator}per_page=100&page=${page}`);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows;
}

export function labelsOf(issue) {
  return new Set((issue.labels || []).map((label) => typeof label === "string" ? label : label.name));
}

export function issueFromText(text = "") {
  const match = text.match(/\b(?:closes|fixes|refs)\s+#(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

export function issueFromBranch(branch = "") {
  const match = branch.match(/^(?:work|fix)\/(\d+)-[a-z0-9][a-z0-9-]*$/);
  return match ? Number(match[1]) : null;
}

export function extractManagedState(body = "") {
  const start = body.indexOf(STATE_START);
  const end = body.indexOf(STATE_END);
  if (start < 0 || end <= start) return "_No managed handoff state recorded._";
  return body.slice(start + STATE_START.length, end).trim() || "_No managed handoff state recorded._";
}

export function replaceBlock(body, start, end, replacement) {
  const first = body.indexOf(start);
  const last = body.indexOf(end);
  if (first >= 0 && last > first) {
    return `${body.slice(0, first)}${replacement}${body.slice(last + end.length)}`;
  }
  return `${replacement}\n\n${body.trim()}`.trim() + "\n";
}

export function markdownCell(value = "") {
  return String(value).replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

export function section(body = "", heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const headingMatch = new RegExp(`^##+\\s+${escaped}\\s*$`, "im").exec(body);
  if (!headingMatch) return "";
  const tail = body.slice(headingMatch.index + headingMatch[0].length).replace(/^\r?\n/, "");
  const nextHeading = tail.search(/^##+\s+/m);
  return (nextHeading >= 0 ? tail.slice(0, nextHeading) : tail).trim();
}

export async function getIssue(number) {
  return github(`/repos/${repository()}/issues/${number}`);
}

export async function setIssueStateLabel(number, target, config) {
  const issue = await getIssue(number);
  if (issue.state !== "open") return;
  const labels = labelsOf(issue);
  const states = new Set(config.github.state_labels);
  const next = [...labels].filter((label) => !states.has(label));
  next.push(target);
  await github(`/repos/${repository()}/issues/${number}`, {
    method: "PATCH",
    body: JSON.stringify({ labels: [...new Set(next)] }),
  });
}

export function globToRegExp(glob) {
  let value = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    const next = glob[index + 1];
    if (char === "*" && next === "*") {
      value += ".*";
      index += 1;
    } else if (char === "*") value += "[^/]*";
    else if (char === "?") value += "[^/]";
    else value += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`^${value}$`);
}

export function matchesAny(path, patterns) {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}
