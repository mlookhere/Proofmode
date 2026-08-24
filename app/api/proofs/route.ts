import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return NextResponse.redirect(new URL("/demo", request.url), 303);
  const form = await request.formData();
  const challengeId = String(form.get("challengeId") || "");
  const caption = String(form.get("caption") || "").slice(0, 280);
  const file = form.get("file");
  if (!challengeId || !(file instanceof File)) return NextResponse.json({ error: "challengeId and image are required" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Use a JPG, PNG, or WebP under 10MB" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const membership = await supabase.from("challenge_members").select("challenge_id").eq("challenge_id", challengeId).eq("user_id", user.id).maybeSingle();
  if (!membership.data) return NextResponse.json({ error: "Join this challenge before posting proof" }, { status: 403 });

  const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = `${user.id}/${challengeId}/${randomUUID()}.${ext}`;
  const upload = await supabase.storage.from("proof-media").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 400 });

  const { data: proofId, error } = await supabase.rpc("create_legacy_proof_v1", {
    target_challenge: challengeId,
    target_media_url: path,
    target_caption: caption,
    target_proof_type: "photo",
  });
  if (error || typeof proofId !== "string") {
    await supabase.storage.from("proof-media").remove([path]);
    return NextResponse.json({ error: error?.message || "Could not create proof" }, { status: 400 });
  }

  await supabase.from("analytics_events").insert({ user_id: user.id, event_name: "proof_posted", source: "proof_upload", properties: { challenge_id: challengeId, proof_id: proofId } });
  return NextResponse.redirect(new URL(`/dashboard?proof=${proofId}`, request.url), 303);
}
