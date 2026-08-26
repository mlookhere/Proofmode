import { createClient } from "@supabase/supabase-js";
import {
  asRevenueCatResponse,
  claimRevenueCatRefresh,
  fetchRevenueCatSnapshot,
  RevenueCatError,
  revenueCatAdminClient,
  syncRevenueCatSnapshot,
} from "@/lib/billing/revenuecat";

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new RevenueCatError(503, `${name} is not configured`);
  return value;
}

async function requireUserId(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new RevenueCatError(401, "Authentication required");
  const client = createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new RevenueCatError(401, "Invalid or expired session");
  return data.user.id;
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request);
    const admin = revenueCatAdminClient();
    const retryAfterSeconds = await claimRevenueCatRefresh(admin, userId);
    if (retryAfterSeconds > 0) {
      return Response.json(
        { error: "Refresh requested too recently", retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
      );
    }

    const snapshot = await fetchRevenueCatSnapshot(userId);
    await syncRevenueCatSnapshot(admin, {
      eventId: `refresh:${userId}:${snapshot.snapshotAt}`,
      eventType: "REFRESH",
      userId,
      snapshot,
    });
    return Response.json({ refreshed: true, entitlements: snapshot.activeEntitlements });
  } catch (error) {
    return asRevenueCatResponse(error);
  }
}
