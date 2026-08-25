import Purchases, { type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import { requireApiUrl, revenueCatApiKey } from "@/config/env";
import { requireSupabase } from "@/lib/supabase";

export type PaidTier = "proof_plus" | "creator";

export type BillingPackage = Readonly<{
  tier: PaidTier;
  identifier: string;
  title: string;
  description: string;
  priceString: string;
  period: string | null;
  revenueCatPackage: PurchasesPackage;
}>;

export type EntitlementState = Readonly<{
  plan: "free" | "pro" | "creator" | "black";
  proof_plus: boolean;
  creator: boolean;
  black: boolean;
  management_url: string | null;
}>;

let configured = false;
let currentUserId: string | null = null;
let identityQueue: Promise<unknown> = Promise.resolve();

function packageTier(pkg: PurchasesPackage): PaidTier | null {
  const identity = `${pkg.identifier} ${pkg.product.identifier}`.toLowerCase();
  if (identity.includes("black")) return null;
  if (identity.includes("creator")) return "creator";
  if (identity.includes("proof_plus") || identity.includes("proofplus") || identity.includes("proof-plus")) return "proof_plus";
  return null;
}

async function ensureConfigured(userId: string) {
  const apiKey = revenueCatApiKey();
  if (!apiKey) return false;

  const sdkConfigured = configured || await Purchases.isConfigured();
  if (!sdkConfigured) {
    Purchases.configure({ apiKey, appUserID: userId });
    configured = true;
    currentUserId = userId;
    return true;
  }

  configured = true;
  const sdkUserId = await Purchases.getAppUserID();
  if (sdkUserId !== userId) await Purchases.logIn(userId);
  currentUserId = userId;
  return true;
}

export function syncRevenueCatIdentity(userId: string | null) {
  identityQueue = identityQueue.then(async () => {
    if (!userId) {
      if (configured && currentUserId) await Purchases.logOut().catch(() => undefined);
      currentUserId = null;
      return false;
    }
    return ensureConfigured(userId);
  });
  return identityQueue as Promise<boolean>;
}

async function recordMonetizationEvent(eventName: string, properties: Record<string, unknown> = {}) {
  const client = requireSupabase();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  await client.from("analytics_events").insert({
    user_id: user.id,
    event_name: eventName,
    source: "mobile_paywall",
    properties,
  });
}

export async function fetchServerEntitlements(): Promise<EntitlementState> {
  const { data, error } = await requireSupabase().rpc("get_my_entitlements_v1");
  if (error) throw error;
  return data as EntitlementState;
}

export async function refreshServerEntitlements() {
  const client = requireSupabase();
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in to refresh purchases.");
  const response = await fetch(`${requireApiUrl()}/api/billing/refresh`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "Could not refresh subscription status.");
  }
  return fetchServerEntitlements();
}

export async function loadBillingPackages(userId: string) {
  if (!await syncRevenueCatIdentity(userId)) return [] as BillingPackage[];
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages || [];
  const result = packages.flatMap((pkg) => {
    const tier = packageTier(pkg);
    if (!tier) return [];
    return [{
      tier,
      identifier: pkg.identifier,
      title: pkg.product.title,
      description: pkg.product.description,
      priceString: pkg.product.priceString,
      period: pkg.product.subscriptionPeriod,
      revenueCatPackage: pkg,
    } satisfies BillingPackage];
  });
  await recordMonetizationEvent("paywall_view", { offering: offerings.current?.identifier || null });
  return result;
}

export async function purchaseBillingPackage(userId: string, billingPackage: BillingPackage) {
  if (!await syncRevenueCatIdentity(userId)) throw new Error("Purchases are not configured for this build.");
  await recordMonetizationEvent("purchase_started", {
    tier: billingPackage.tier,
    package: billingPackage.identifier,
    product: billingPackage.revenueCatPackage.product.identifier,
  });
  try {
    const result = await Purchases.purchasePackage(billingPackage.revenueCatPackage);
    await recordMonetizationEvent("purchase_success", {
      tier: billingPackage.tier,
      product: result.productIdentifier,
    });
    await refreshServerEntitlements();
    return result.customerInfo;
  } catch (error) {
    if (typeof error === "object" && error && "userCancelled" in error && error.userCancelled === true) return null;
    throw error;
  }
}

export async function restorePurchases(userId: string): Promise<CustomerInfo> {
  if (!await syncRevenueCatIdentity(userId)) throw new Error("Purchases are not configured for this build.");
  const customerInfo = await Purchases.restorePurchases();
  await recordMonetizationEvent("restore_success", {
    proof_plus: Boolean(customerInfo.entitlements.active.proof_plus),
    creator: Boolean(customerInfo.entitlements.active.creator),
  });
  await refreshServerEntitlements();
  return customerInfo;
}

export async function currentCustomerInfo(userId: string) {
  if (!await syncRevenueCatIdentity(userId)) return null;
  return Purchases.getCustomerInfo();
}
