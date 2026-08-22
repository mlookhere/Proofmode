import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return NextResponse.json({ code: "demo-receipt" });
  const { challengeId } = await request.json();
  if (!challengeId) return NextResponse.json({ error: "challengeId is required" }, { status: 400 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await supabase.from("challenge_members").select("role").eq("challenge_id", challengeId).eq("user_id", user.id).maybeSingle();
  const owned = await supabase.from("challenges").select("id").eq("id", challengeId).eq("owner_id", user.id).maybeSingle();
  if (!membership.data && !owned.data) return NextResponse.json({ error: "Join this challenge before inviting people" }, { status: 403 });

  const existing = await supabase.from("invites").select("code").eq("challenge_id", challengeId).eq("inviter_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.data?.code) return NextResponse.json({ code: existing.data.code });

  const { data, error } = await supabase.from("invites").insert({ challenge_id: challengeId, inviter_id: user.id }).select("code").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabase.from("analytics_events").insert({ user_id: user.id, event_name: "invite_sent", source: "challenge", properties: { challenge_id: challengeId } });
  return NextResponse.json({ code: data.code }, { status: 201 });
}
