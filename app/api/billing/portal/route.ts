import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return NextResponse.redirect(new URL("/pricing", request.url), 303);
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/dashboard", request.url), 303);
  const subscription = await supabase.from("subscriptions").select("stripe_customer_id").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (!subscription.data?.stripe_customer_id) return NextResponse.redirect(new URL("/pricing?reason=no_subscription", request.url), 303);
  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  const body = new URLSearchParams({ customer: subscription.data.stripe_customer_id, return_url: `${origin}/dashboard` });
  const stripeResponse = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded", "Stripe-Version": "2026-06-24.dahlia" },
    body,
    cache: "no-store"
  });
  const session = await stripeResponse.json() as { url?: string; error?: { message?: string } };
  if (!stripeResponse.ok || !session.url) return NextResponse.json({ error: session.error?.message || "Unable to open billing portal" }, { status: 502 });
  return NextResponse.redirect(session.url, 303);
}
