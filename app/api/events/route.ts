import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

const ALLOWED = new Set(["landing_view","demo_open","challenge_started","drop_launched","drop_view","invite_sent","invite_accepted","proof_posted","proof_verified","proof_rejected","receipt_shared","callout_shared","share_click","challenge_joined_from_share","profile_view","day7_retained","day30_completed","paywall_view","checkout_start","subscription_active"]);

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return new NextResponse(null, { status: 204 });
  const body = await request.json();
  const eventName = String(body.eventName || "");
  if (!ALLOWED.has(eventName)) return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("analytics_events").insert({ user_id: user?.id || null, event_name: eventName, source: String(body.source || "web").slice(0, 40), properties: body.properties && typeof body.properties === "object" ? body.properties : {} });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
