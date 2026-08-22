import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const slug = String(form.get("slug") || "");
  const inviteCode = String(form.get("inviteCode") || "").slice(0, 64) || null;
  if (!slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });
  if (!hasSupabaseEnv()) return NextResponse.redirect(new URL(`/c/${encodeURIComponent(slug)}`, request.url), 303);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const nextPath = `/c/${slug}${inviteCode ? `?ref=${encodeURIComponent(inviteCode)}` : ""}`;
  if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(nextPath)}`, request.url), 303);

  const joined = await supabase.rpc("join_challenge_v2", { target_slug: slug, target_invite_code: inviteCode });
  if (joined.error) {
    const message = joined.error.message.toLowerCase();
    if (message.includes("crew full")) return NextResponse.redirect(new URL(`/pricing?reason=crew_full`, request.url), 303);
    if (message.includes("invite required")) return NextResponse.redirect(new URL(`/c/${slug}?error=invite_required`, request.url), 303);
    return NextResponse.json({ error: joined.error.message }, { status: 400 });
  }
  await supabase.from("analytics_events").insert({ user_id: user.id, event_name: inviteCode ? "invite_accepted" : "challenge_joined_from_share", source: "challenge_page", properties: { challenge_id: joined.data, invite_code: inviteCode } });
  return NextResponse.redirect(new URL(`/c/${slug}?joined=1`, request.url), 303);
}
