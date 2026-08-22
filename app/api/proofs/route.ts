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

  const { data, error } = await supabase.from("proofs").insert({ challenge_id: challengeId, user_id: user.id, caption, media_url: path, proof_type: "photo" }).select("id").single();
  if (error) {
    await supabase.storage.from("proof-media").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  await supabase.from("analytics_events").insert({ user_id: user.id, event_name: "proof_posted", source: "proof_upload", properties: { challenge_id: challengeId, proof_id: data.id } });
  return NextResponse.redirect(new URL(`/dashboard?proof=${data.id}`, request.url), 303);
}
