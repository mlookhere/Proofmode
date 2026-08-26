import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const requireAll = (source, values, label) => {
  for (const value of values) assert(source.includes(value), `${label} is missing: ${value}`);
};

const migration = await read("supabase/migrations/021_alpha_readiness_hardening.sql");
requireAll(migration, [
  "revoke truncate, references, trigger on all tables in schema public from public, anon, authenticated",
  "alter default privileges in schema public revoke truncate, references, trigger on tables from public, anon, authenticated",
  "grant insert on table public.analytics_events to anon, authenticated",
  "grant select on table public.challenge_members to authenticated",
  "grant select on table public.challenge_templates to anon, authenticated",
  "grant insert, update on table public.challenges to authenticated",
  "grant select, insert, delete on table public.user_interests to authenticated",
  "grant select, insert, delete on table public.watched_challenges to authenticated",
  'drop policy if exists "users comment" on public.comments',
  'drop policy if exists "users follow" on public.follows',
  'drop policy if exists "users react" on public.post_reactions',
  'drop policy if exists "users create own journeys" on public.journeys',
  'drop policy if exists "users insert own proofs" on public.proofs',
  'drop policy if exists "users submit reports" on public.reports',
  'drop policy if exists "members verify proofs" on public.verifications',
  'create policy "blocker reads own blocks"',
  "private.claim_revenuecat_refresh_v1",
  "public.claim_revenuecat_refresh_v1",
  "revenuecat:refresh_claim",
  "pg_advisory_xact_lock",
  "make_interval(secs => 60)",
  "grant execute on function public.claim_revenuecat_refresh_v1(uuid) to service_role",
], "Alpha hardening migration");
assert(!migration.includes("grant execute on function public.claim_revenuecat_refresh_v1(uuid) to authenticated"), "Client roles must not claim RevenueCat refresh windows");

const test = await read("supabase/tests/database/012_alpha_readiness_hardening.test.sql");
const plan = Number(test.match(/select\s+plan\((\d+)\)/i)?.[1]);
const assertions = (test.match(/select\s+(?:ok|is|throws_ok|throws_like|lives_ok)\s*\(/gi) ?? []).length;
assert(plan === 32 && assertions === 32, `Alpha hardening pgTAP plan mismatch: plan=${plan}, assertions=${assertions}`);
requireAll(test, [
  "anon cannot truncate subscriptions",
  "analytics events are not client-readable",
  "membership writes remain RPC-owned",
  "interest insert remains an intentional client path",
  "Watch Drop insert remains an intentional client path",
  "obsolete direct-mutation policies are removed",
  "client cannot claim provider refresh window",
  "immediate duplicate refresh is durably rate limited",
  "refresh limiter reuses one durable billing row per user",
  "refresh claim reopens after the fixed window",
  "select * from finish()",
  "rollback;",
], "Alpha hardening pgTAP");

const revenueCat = await read("lib/billing/revenuecat.ts");
requireAll(revenueCat, [
  "claimRevenueCatRefresh",
  'admin.rpc("claim_revenuecat_refresh_v1"',
  "Could not claim RevenueCat refresh window",
  "retryAfterSeconds",
], "RevenueCat refresh helper");

const refresh = await read("app/api/billing/refresh/route.ts");
requireAll(refresh, [
  "claimRevenueCatRefresh(admin, userId)",
  "fetchRevenueCatSnapshot(userId)",
  'status: 429',
  '"Retry-After"',
], "Billing refresh route");
assert(
  refresh.indexOf("claimRevenueCatRefresh(admin, userId)") < refresh.indexOf("fetchRevenueCatSnapshot(userId)"),
  "Billing refresh must claim the durable window before contacting RevenueCat",
);

const audit = await read("docs/ALPHA_READINESS_AUDIT.md");
requireAll(audit, [
  "# Roadmap stages 0–15",
  "# P0 release-gate audit",
  "## Build / environments",
  "## Account / onboarding",
  "## ProofTV",
  "## Create",
  "## Challenges / Journeys",
  "## Social",
  "## Sharing / attribution",
  "## Notifications",
  "## Payments",
  "## Safety",
  "## Observability",
  "# Database/security hardening findings",
  "# External verification matrix",
  "# Next execution order",
  "#36",
  "#37",
  "#38",
  "#39",
  "#40",
  "#41",
], "Alpha readiness audit");
for (const forbidden of [
  "Apple sign-in | Yes",
  "Google sign-in | Yes",
  "Stage 13 — Creator Studio | **VERIFIED**",
  "Stage 14 — Safety/admin | **VERIFIED**",
  "Stage 15 — Closed alpha | **VERIFIED**",
]) assert(!audit.includes(forbidden), `Audit overstates an unverified gate: ${forbidden}`);

console.log("Alpha readiness hardening validation passed.");
