import { access, readFile } from "node:fs/promises";
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

const migration = await read("supabase/migrations/020_revenuecat_monetization.sql");
requireAll(migration, [
  "profiles_plan_check check (plan in ('free', 'pro', 'creator', 'black'))",
  "provider text",
  "provider_subscription_id text",
  "entitlement text",
  "provider_event_at timestamptz",
  "subscriptions_provider_identifier_idx",
  "subscriptions_user_provider_status_idx",
  "revoke insert, update, delete on table public.subscriptions from public, anon, authenticated",
  "private.recompute_effective_plan_v1",
  "current_plan = 'black'",
  "private.sync_revenuecat_entitlements_v1",
  "public.sync_revenuecat_entitlements_v1",
  "public.get_my_entitlements_v1",
  "security invoker",
  "security definer",
  "invalid RevenueCat entitlement",
  "active_entitlements text[]",
  "target_event_at < latest_event_at",
  "grant execute on function public.sync_revenuecat_entitlements_v1",
  "to service_role",
  "grant execute on function public.get_my_entitlements_v1() to authenticated, service_role",
  "provider = 'revenuecat'",
  "provider = 'stripe'",
  "actor_plan in ('pro', 'creator', 'black')",
  "when 'black' then target_seat_cap is null or target_seat_cap <= 100000",
], "Stage 12 migration");
assert(!migration.includes("entitlement in ('proof_plus', 'creator', 'black')"), "RevenueCat provider state must not be able to grant Black");
assert(!/create\s+table(?:\s+if\s+not\s+exists)?\s+public\.(?:plans|entitlements)\b/i.test(migration), "Stage 12 must extend the existing billing model, not create a parallel user-plan ledger");

const test = await read("supabase/tests/database/011_revenuecat_monetization.test.sql");
const plan = Number(test.match(/select\s+plan\((\d+)\)/i)?.[1]);
const assertions = (test.match(/select\s+(?:ok|is|throws_ok|throws_like|lives_ok)\s*\(/gi) ?? []).length;
assert(plan === 29 && assertions === 29, `Stage 12 pgTAP plan mismatch: plan=${plan}, assertions=${assertions}`);
requireAll(test, [
  "authenticated client cannot forge RevenueCat state",
  "authenticated client cannot mutate subscription state directly",
  "Proof+ maps to legacy internal pro plan",
  "duplicate RevenueCat event is idempotent",
  "older RevenueCat delivery cannot downgrade newer state",
  "provider payload can never grant Black",
  "RevenueCat cannot downgrade server-owned Black",
  "Black inherits Creator",
  "legacy Stripe Proof+ remains a valid entitlement source",
  "effective plan chooses highest active provider entitlement",
  "legacy Stripe Proof+ survives RevenueCat expiration",
  "select * from finish()",
  "rollback;",
], "Stage 12 pgTAP");

const server = await read("lib/billing/revenuecat.ts");
requireAll(server, [
  "timingSafeEqual",
  "createHmac",
  "REVENUECAT_WEBHOOK_AUTH",
  "REVENUECAT_WEBHOOK_SIGNING_SECRET",
  "REVENUECAT_SECRET_API_KEY",
  "Math.abs(Date.now() / 1000 - timestamp) > 300",
  ".update(`${timestampText}.${rawBody}`)",
  "https://api.revenuecat.com/v1/subscribers/",
  "cache: \"no-store\"",
  "CANONICAL_ENTITLEMENTS",
  "proof_plus",
  "creator",
  "sync_revenuecat_entitlements_v1",
], "RevenueCat server helper");
assert(!server.includes('CANONICAL_ENTITLEMENTS = new Set(["proof_plus", "creator", "black"])'), "Black must not be a RevenueCat entitlement");

const webhook = await read("app/api/revenuecat/webhook/route.ts");
requireAll(webhook, [
  "await request.text()",
  "verifyRevenueCatWebhook",
  'request.headers.get("authorization")',
  'request.headers.get("x-revenuecat-webhook-signature")',
  "isProofModeUserId",
  "unidentified_app_user",
  "fetchRevenueCatSnapshot",
  "syncRevenueCatSnapshot",
], "RevenueCat webhook");
assert(webhook.indexOf("verifyRevenueCatWebhook") < webhook.indexOf("JSON.parse(rawBody)"), "RevenueCat webhook must authenticate the raw body before parsing/provider-state mutation");

const refresh = await read("app/api/billing/refresh/route.ts");
requireAll(refresh, [
  "Authentication required",
  "auth.getUser(token)",
  "fetchRevenueCatSnapshot(userId)",
  "syncRevenueCatSnapshot",
  "access_token",
], "Billing refresh route");
assert(!/active_entitlements\s*:\s*body/i.test(refresh), "Billing refresh must not accept client-authored entitlement state");

const checkout = await read("app/api/checkout/route.ts");
requireAll(checkout, [
  "REVENUECAT_PROOF_PLUS_PURCHASE_URL",
  "REVENUECAT_CREATOR_PURCHASE_URL",
  "purchaseUrl(configuredUrl, user.id, user.email)",
  'event_name: "purchase_started"',
  '.eq("provider", "stripe")',
], "Web RevenueCat checkout");
assert(!checkout.includes("https://api.stripe.com/v1/checkout/sessions"), "New web checkout must not create direct Stripe subscriptions");

const portal = await read("app/api/billing/portal/route.ts");
requireAll(portal, [
  'rpc("get_my_entitlements_v1")',
  "management_url",
  '.eq("provider", "stripe")',
  "https://api.stripe.com/v1/billing_portal/sessions",
], "Billing management compatibility");

const pricing = await read("app/pricing/page.tsx");
requireAll(pricing, [
  'plan: "proof_plus" | "creator"',
  'plan="proof_plus"',
  "PROOFMODE BLACK",
  "There is no public application",
], "Pricing page");
assert(!/plan=["']black["']/i.test(pricing), "Pricing must not expose a Black purchase action");

const mobilePackage = JSON.parse(await read("mobile/package.json"));
const mobileLock = JSON.parse(await read("mobile/package-lock.json"));
assert(mobilePackage.dependencies?.["react-native-purchases"] === "10.7.2", "Mobile RevenueCat SDK must be pinned to 10.7.2");
assert(mobileLock.packages?.[""]?.dependencies?.["react-native-purchases"] === "10.7.2", "Mobile lock root is missing RevenueCat 10.7.2");
for (const [path, version] of [
  ["node_modules/react-native-purchases", "10.7.2"],
  ["node_modules/@revenuecat/purchases-js-hybrid-mappings", "18.31.0"],
  ["node_modules/@revenuecat/purchases-typescript-internal", "18.31.0"],
  ["node_modules/@revenuecat/purchases-js", "1.52.3"],
]) assert(mobileLock.packages?.[path]?.version === version, `Mobile lock mismatch: ${path}@${version}`);

const mobileEnv = await read("mobile/.env.example");
requireAll(mobileEnv, [
  "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=",
], "Mobile RevenueCat environment");
assert(!/REVENUECAT_(?:SECRET|WEBHOOK)/.test(mobileEnv), "RevenueCat server credentials must not be exposed through mobile environment variables");

const rootEnv = await read(".env.example");
for (const key of [
  "REVENUECAT_WEBHOOK_AUTH",
  "REVENUECAT_WEBHOOK_SIGNING_SECRET",
  "REVENUECAT_SECRET_API_KEY",
  "REVENUECAT_PROJECT_ID",
  "REVENUECAT_PROOF_PLUS_PURCHASE_URL",
  "REVENUECAT_CREATOR_PURCHASE_URL",
]) assert(rootEnv.includes(`${key}=`), `Missing ${key} from .env.example`);

const mobileBilling = await read("mobile/src/billing/revenuecat.ts");
requireAll(mobileBilling, [
  'from "react-native-purchases"',
  "Purchases.configure",
  "Purchases.isConfigured",
  "Purchases.getAppUserID",
  "Purchases.logIn",
  "Purchases.logOut",
  "Purchases.getOfferings",
  "offerings.current?.availablePackages",
  "Purchases.purchasePackage",
  "Purchases.restorePurchases",
  'recordMonetizationEvent("paywall_view"',
  'recordMonetizationEvent("purchase_started"',
  'recordMonetizationEvent("purchase_success"',
  'recordMonetizationEvent("restore_success"',
  "/api/billing/refresh",
  "fetchServerEntitlements",
], "Mobile RevenueCat client");
assert(mobileBilling.includes('if (identity.includes("black")) return null'), "Mobile Offering filtering must reject Black packages");
assert(!/REVENUECAT_(?:SECRET|WEBHOOK)/.test(mobileBilling), "RevenueCat server credentials leaked into the mobile billing client");

const session = await read("mobile/src/auth/session.tsx");
requireAll(session, [
  "syncRevenueCatIdentity(session?.user.id ?? null)",
  "await syncRevenueCatIdentity(null)",
  "await supabase.auth.signOut()",
], "RevenueCat auth identity lifecycle");

const paywall = await read("mobile/app/settings/billing.tsx");
requireAll(paywall, [
  "loadBillingPackages",
  "purchaseBillingPackage",
  "restorePurchases",
  "CURRENT PLAN",
  "PROOF+",
  "CREATOR",
  "PROOFMODE BLACK",
  "INVITATION-ONLY",
  "RESTORE PURCHASES",
  "MANAGE SUBSCRIPTION",
], "Mobile membership screen");
assert(!/purchaseBillingPackage\([^\n]*black/i.test(paywall), "Mobile membership screen must not expose a Black purchase");

const you = await read("mobile/app/(tabs)/you.tsx");
requireAll(you, ["MEMBERSHIP", "PROOF+ · CREATOR · RESTORE", "/settings/billing"], "Passport Membership entry");

try {
  await access(resolve(root, ".github/workflows/stage12-lock-refresh.yml"));
  throw new Error("Temporary Stage 12 lock workflow must not remain in the product branch");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

console.log("Stage 12 RevenueCat validation passed.");
