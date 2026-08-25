import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

const plans = {
  proof_plus: "REVENUECAT_PROOF_PLUS_PURCHASE_URL",
  creator: "REVENUECAT_CREATOR_PURCHASE_URL",
} as const;

function purchaseUrl(base: string, userId: string, email: string) {
  const url = new URL(base);
  url.pathname = `${url.pathname.replace(/\/$/, "")}/${userId}`;
  url.searchParams.set("email", email);
  return url;
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return NextResponse.redirect(new URL("/login", request.url), 303);

  const form = await request.formData();
  const rawPlan = String(form.get("plan") || "");
  const plan = rawPlan === "pro" ? "proof_plus" : rawPlan;
  if (!(plan in plans)) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.redirect(new URL("/login?next=/pricing", request.url), 303);

  // Existing direct-Stripe subscribers keep their original management path instead of
  // accidentally creating a second subscription during the RevenueCat transition.
  const legacySubscription = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", "stripe")
    .in("status", ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"])
    .limit(1)
    .maybeSingle();
  if (legacySubscription.data) {
    return NextResponse.redirect(new URL("/dashboard?billing=existing", request.url), 303);
  }

  const configuredUrl = process.env[plans[plan as keyof typeof plans]]?.trim();
  if (!configuredUrl) return NextResponse.json({ error: `RevenueCat purchase link is not configured for ${plan}` }, { status: 503 });

  await supabase.from("analytics_events").insert({
    user_id: user.id,
    event_name: "purchase_started",
    source: "web_pricing",
    properties: { plan },
  });

  return NextResponse.redirect(purchaseUrl(configuredUrl, user.id, user.email), 303);
}
