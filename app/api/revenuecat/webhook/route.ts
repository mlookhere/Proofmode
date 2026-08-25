import {
  asRevenueCatResponse,
  fetchRevenueCatSnapshot,
  isProofModeUserId,
  revenueCatAdminClient,
  syncRevenueCatSnapshot,
  verifyRevenueCatWebhook,
} from "@/lib/billing/revenuecat";

type RevenueCatWebhook = Readonly<{
  event?: {
    id?: string;
    type?: string;
    app_user_id?: string;
    event_timestamp_ms?: number;
  };
}>;

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    verifyRevenueCatWebhook(
      rawBody,
      request.headers.get("authorization"),
      request.headers.get("x-revenuecat-webhook-signature"),
    );

    let payload: RevenueCatWebhook;
    try {
      payload = JSON.parse(rawBody) as RevenueCatWebhook;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const event = payload.event;
    const eventId = event?.id?.trim();
    const eventType = event?.type?.trim() || "UNKNOWN";
    const userId = event?.app_user_id?.trim();
    if (!eventId) return Response.json({ error: "Missing RevenueCat event id" }, { status: 400 });
    if (!isProofModeUserId(userId)) {
      // ProofMode uses identified UUID customers only. Do not alias an anonymous or foreign
      // RevenueCat identity into an account based on untrusted webhook fields.
      return Response.json({ received: true, ignored: true, reason: "unidentified_app_user" });
    }

    const snapshot = await fetchRevenueCatSnapshot(userId);
    const processed = await syncRevenueCatSnapshot(revenueCatAdminClient(), {
      eventId,
      eventType,
      userId,
      snapshot,
    });
    return Response.json({ received: true, duplicate: !processed });
  } catch (error) {
    return asRevenueCatResponse(error);
  }
}
