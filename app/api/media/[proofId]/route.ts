import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function GET(request: Request, { params }: { params: Promise<{ proofId: string }> }) {
  if (!hasSupabaseEnv()) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { proofId } = await params;
  const userClient = await createClient();
  const { data: proof, error } = await userClient
    .from("proofs")
    .select("media_url,media_asset_id")
    .eq("id", proofId)
    .single();
  if (error || !proof) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });

  if (proof.media_asset_id) {
    const { data: asset, error: assetError } = await userClient
      .from("media_assets")
      .select("public_url,processing_status,moderation_status")
      .eq("id", proof.media_asset_id)
      .single();
    if (assetError || !asset || asset.processing_status !== "ready" || asset.moderation_status !== "approved" || !asset.public_url) {
      return NextResponse.json({ error: "Receipt media is not available" }, { status: 404 });
    }
    return NextResponse.redirect(asset.public_url, 302);
  }

  if (!proof.media_url) return NextResponse.json({ error: "Receipt media is not available" }, { status: 404 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Media signer not configured" }, { status: 503 });
  const admin = createAdmin(url, key, { auth: { persistSession: false } });
  const { data, error: signError } = await admin.storage.from("proof-media").createSignedUrl(proof.media_url, 600);
  if (signError || !data?.signedUrl) return NextResponse.json({ error: "Unable to sign media" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, 302);
}
