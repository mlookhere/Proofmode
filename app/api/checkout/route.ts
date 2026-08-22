import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

const plans = {
  pro: { priceId: () => process.env.STRIPE_PROOF_PLUS_PRICE_ID || process.env.STRIPE_PRO_PRICE_ID },
  creator: { priceId: () => process.env.STRIPE_CREATOR_PRICE_ID }
} as const;

function integrationIdentifier() {
  const suffix = Array.from(randomBytes(8), (byte) => String.fromCharCode(97 + (byte % 26))).join("");
  return `proofmode_${suffix}`;
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return NextResponse.redirect(new URL("/login", request.url), 303);
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });

  const form = await request.formData();
  const plan = String(form.get("plan") || "") as keyof typeof plans;
  if (!(plan in plans)) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  const priceId = plans[plan].priceId();
  if (!priceId) return NextResponse.json({ error: `Missing Stripe price for ${plan}` }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.redirect(new URL("/login", request.url), 303);

  // Never create a second live subscription for the same ProofMode account. Existing
  // subscribers manage upgrades, payment methods, and cancellation through Customer Portal.
  const existingSubscription = await supabase
    .from("subscriptions")
    .select("stripe_subscription_id,status")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"])
    .limit(1)
    .maybeSingle();
  if (existingSubscription.data) {
    return NextResponse.redirect(new URL("/dashboard?billing=existing", request.url), 303);
  }

  await supabase.from("analytics_events").insert({ user_id: user.id, event_name: "checkout_start", source: "pricing", properties: { plan } });

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const body = new URLSearchParams({
    mode: "subscription",
    success_url: `${origin}/dashboard?upgraded=1`,
    cancel_url: `${origin}/pricing?canceled=1`,
    customer_email: user.email,
    client_reference_id: user.id,
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "subscription_data[metadata][user_id]": user.id,
    "subscription_data[metadata][plan]": plan,
    allow_promotion_codes: "true",
    integration_identifier: integrationIdentifier()
  });

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2026-06-24.dahlia" },
    body,
    cache: "no-store"
  });
  const session = await stripeResponse.json() as { url?: string; error?: { message?: string } };
  if (!stripeResponse.ok || !session.url) return NextResponse.json({ error: session.error?.message || "Unable to start checkout" }, { status: 502 });
  return NextResponse.redirect(session.url, 303);
}
