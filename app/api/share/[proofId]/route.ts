import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

function esc(s: string) { return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[c] || c)); }
function dayNumber(start: string, proofDate: string) {
  const a = new Date(`${start.slice(0,10)}T00:00:00Z`).getTime();
  const b = new Date(`${proofDate.slice(0,10)}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((b - a) / 86400000) + 1);
}

export async function GET(request: Request, { params }: { params: Promise<{ proofId: string }> }) {
  const { proofId } = await params;
  let title = "30 DAYS STRONG";
  let slug = "30-days-strong";
  let day = 19;
  let verified = 4;
  let handle = "proofmode";
  let receiptId = proofId.slice(0, 8);

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: proof } = await supabase.from("proofs").select("id,challenge_id,user_id,proof_date").eq("id", proofId).single();
    if (!proof) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    const { data: challenge } = await supabase.from("challenges").select("title,slug,created_at").eq("id", proof.challenge_id).single();
    if (challenge) { title = challenge.title; slug = challenge.slug; day = dayNumber(challenge.created_at, proof.proof_date); }
    const { data: profile } = await supabase.from("profiles").select("handle").eq("id", proof.user_id).maybeSingle();
    if (profile?.handle) handle = profile.handle;
    receiptId = proof.id.slice(0, 8);

    const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (adminKey && url) {
      const admin = createAdmin(url, adminKey, { auth: { persistSession: false } });
      const count = await admin.from("verifications").select("proof_id", { count: "exact", head: true }).eq("proof_id", proofId).eq("verdict", true);
      verified = count.count || 0;
    }
  }

  const safeTitle = esc(title.toUpperCase().slice(0, 34));
  const safeHandle = esc(`@${handle}`.slice(0, 30));
  const challengePath = esc(`/c/${slug}`.slice(0, 70));
  const id = esc(receiptId);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920"><rect width="1080" height="1920" rx="70" fill="#d7ff3f"/><rect x="58" y="58" width="964" height="1804" rx="44" fill="none" stroke="#090a0c" stroke-width="5"/><circle cx="112" cy="122" r="10" fill="#090a0c"/><text x="142" y="138" font-family="Arial,Helvetica,sans-serif" font-size="38" font-weight="900" fill="#090a0c">PROOFMODE · RECEIPT ${id}</text><text x="76" y="300" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="900" fill="#090a0c">${safeTitle}</text><text x="76" y="1010" font-family="Arial,Helvetica,sans-serif" font-size="235" font-weight="900" letter-spacing="-14" fill="#090a0c">DAY ${day}.</text><rect x="76" y="1085" width="470" height="74" rx="37" fill="#090a0c"/><text x="106" y="1137" font-family="Arial,Helvetica,sans-serif" font-size="31" font-weight="900" fill="#d7ff3f">✓ VERIFIED × ${verified}</text><text x="76" y="1535" font-family="Arial,Helvetica,sans-serif" font-size="52" font-weight="900" fill="#090a0c">${safeHandle}</text><text x="76" y="1610" font-family="Arial,Helvetica,sans-serif" font-size="35" font-weight="800" fill="#090a0c">NO RECEIPT. NO STREAK.</text><line x1="76" y1="1690" x2="1004" y2="1690" stroke="#090a0c" stroke-width="4"/><text x="76" y="1770" font-family="Arial,Helvetica,sans-serif" font-size="35" font-weight="900" fill="#090a0c">BEAT MY STREAK → ${challengePath}</text></svg>`;
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" } });
}
