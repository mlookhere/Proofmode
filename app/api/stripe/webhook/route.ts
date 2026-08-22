import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function verifyStripeSignature(payload: string, header: string, secret: string) {
  const timestamp = header.split(",").find((part) => part.startsWith("t="))?.slice(2);
  const signatures = header.split(",").filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0 || !Number.isFinite(Number(timestamp))) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  return signatures.some((signature) => {
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || !supabaseUrl || !serviceKey) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });

  const raw = await request.text();
  const signature = request.headers.get("stripe-signature") || "";
  if (!verifyStripeSignature(raw, signature, secret)) return NextResponse.json({ error: "Invalid signature" }, { status: 400 });

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subscriptionEvents = new Set([
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed"
  ]);
  if (!subscriptionEvents.has(event.type || "")) return NextResponse.json({ received: true, ignored: true });
  if (!event.id) return NextResponse.json({ error: "Missing Stripe event id" }, { status: 400 });

  const object = event.data?.object || {};
  const metadata = (object.metadata || {}) as Record<string, string>;
  const userId = metadata.user_id || null;
  const requestedPlan = metadata.plan || null;
  const plan = requestedPlan === "pro" || requestedPlan === "creator" ? requestedPlan : null;
  const customerId = String(object.customer || "");
  const status = String(object.status || "inactive");
  const subscriptionId = String(object.id || "");
  if (!customerId || !subscriptionId) return NextResponse.json({ error: "Malformed subscription event" }, { status: 400 });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: processed, error } = await supabase.rpc("sync_stripe_subscription_event", {
    stripe_event_id: event.id,
    stripe_event_type: event.type || "unknown",
    target_subscription_id: subscriptionId,
    target_customer_id: customerId,
    target_user_id: userId,
    target_status: status,
    target_plan: plan
  });
  if (error) return NextResponse.json({ error: "Subscription sync failed" }, { status: 500 });

  return NextResponse.json({ received: true, duplicate: processed === false });
}
