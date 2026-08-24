import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return NextResponse.json({ ok: true, demo: true });
  const body = await request.json();
  const proofId = String(body.proofId || "");
  if (!proofId) return NextResponse.json({ error: "proofId is required" }, { status: 400 });
  if (typeof body.verdict !== "boolean") return NextResponse.json({ error: "verdict must be a boolean" }, { status: 400 });
  const verdict = body.verdict;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.rpc("set_proof_verification_v1", {
    target_proof: proofId,
    target_verdict: verdict,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("analytics_events").insert({
    user_id: user.id,
    event_name: verdict ? "proof_verified" : "proof_rejected",
    source: "receipt",
    properties: { proof_id: proofId },
  });
  return NextResponse.json({ ok: true });
}
