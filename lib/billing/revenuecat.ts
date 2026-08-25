import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const CANONICAL_ENTITLEMENTS = new Set(["proof_plus", "creator"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class RevenueCatError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RevenueCatError";
    this.status = status;
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new RevenueCatError(503, `${name} is not configured`);
  return value;
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isProofModeUserId(value: string | null | undefined): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function revenueCatAdminClient(): SupabaseClient {
  return createClient(requiredEnv("NEXT_PUBLIC_SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function verifyRevenueCatWebhook(rawBody: string, authorization: string | null, signatureHeader: string | null) {
  const expectedAuthorization = requiredEnv("REVENUECAT_WEBHOOK_AUTH");
  if (!authorization || !safeEqual(authorization, expectedAuthorization)) {
    throw new RevenueCatError(401, "Invalid RevenueCat webhook authorization");
  }

  const signingSecret = requiredEnv("REVENUECAT_WEBHOOK_SIGNING_SECRET");
  if (!signatureHeader) throw new RevenueCatError(401, "Missing RevenueCat webhook signature");
  const values = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.trim().split("=", 2);
      return [key, value] as const;
    }),
  );
  const timestampText = values.get("t");
  const signature = values.get("v1");
  const timestamp = Number(timestampText);
  if (!timestampText || !signature || !Number.isFinite(timestamp)) {
    throw new RevenueCatError(401, "Invalid RevenueCat webhook signature");
  }
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
    throw new RevenueCatError(401, "Expired RevenueCat webhook signature");
  }

  const expected = createHmac("sha256", signingSecret).update(`${timestampText}.${rawBody}`).digest("hex");
  if (!safeEqual(expected, signature)) throw new RevenueCatError(401, "Invalid RevenueCat webhook signature");
}

type RevenueCatEntitlement = Readonly<{
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
}>;

type RevenueCatCustomerResponse = Readonly<{
  request_date?: string;
  request_date_ms?: number;
  subscriber?: {
    entitlements?: Record<string, RevenueCatEntitlement>;
    management_url?: string | null;
  };
}>;

function entitlementIsActive(entitlement: RevenueCatEntitlement | undefined, nowMs: number) {
  if (!entitlement) return false;
  if (!entitlement.expires_date) return true;
  const expiresAt = Date.parse(entitlement.expires_date);
  const graceAt = entitlement.grace_period_expires_date ? Date.parse(entitlement.grace_period_expires_date) : Number.NaN;
  return (Number.isFinite(expiresAt) && expiresAt > nowMs) || (Number.isFinite(graceAt) && graceAt > nowMs);
}

export type RevenueCatSnapshot = Readonly<{
  activeEntitlements: readonly string[];
  managementUrl: string | null;
  snapshotAt: string;
}>;

export async function fetchRevenueCatSnapshot(userId: string): Promise<RevenueCatSnapshot> {
  if (!isProofModeUserId(userId)) throw new RevenueCatError(400, "Invalid ProofMode App User ID");
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${requiredEnv("REVENUECAT_SECRET_API_KEY")}`,
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as RevenueCatCustomerResponse | null;
  if (!response.ok || !payload?.subscriber) throw new RevenueCatError(502, "Could not refresh RevenueCat customer state");

  const nowMs = Date.now();
  const entitlements = payload.subscriber.entitlements || {};
  const activeEntitlements = Object.entries(entitlements)
    .filter(([name, value]) => CANONICAL_ENTITLEMENTS.has(name) && entitlementIsActive(value, nowMs))
    .map(([name]) => name)
    .sort();
  const requestMs = Number(payload.request_date_ms);
  const snapshotAt = Number.isFinite(requestMs)
    ? new Date(requestMs).toISOString()
    : new Date(payload.request_date || Date.now()).toISOString();

  return {
    activeEntitlements,
    managementUrl: payload.subscriber.management_url || null,
    snapshotAt,
  };
}

export async function syncRevenueCatSnapshot(
  admin: SupabaseClient,
  input: Readonly<{
    eventId: string;
    eventType: string;
    userId: string;
    snapshot: RevenueCatSnapshot;
  }>,
) {
  const { data, error } = await admin.rpc("sync_revenuecat_entitlements_v1", {
    revenuecat_event_id: input.eventId,
    revenuecat_event_type: input.eventType,
    target_user_id: input.userId,
    target_event_at: input.snapshot.snapshotAt,
    active_entitlements: [...input.snapshot.activeEntitlements],
    target_management_url: input.snapshot.managementUrl,
  });
  if (error) throw new RevenueCatError(500, "RevenueCat entitlement synchronization failed");
  return data === true;
}

export function asRevenueCatResponse(error: unknown) {
  if (error instanceof RevenueCatError) return Response.json({ error: error.message }, { status: error.status });
  console.error(error);
  return Response.json({ error: "RevenueCat request failed" }, { status: 500 });
}
