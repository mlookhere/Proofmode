import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type ReceiptShare = {
  id: string;
  handle: string | null;
  display_name: string | null;
  challenge_slug: string;
  challenge_title: string;
  challenge_created_at: string;
  proof_date: string;
  verified_count: number;
};

type ShareFormat = "story" | "portrait" | "square";

const dimensions: Record<ShareFormat, { width: number; height: number; daySize: number }> = {
  story: { width: 1080, height: 1920, daySize: 220 },
  portrait: { width: 1080, height: 1350, daySize: 180 },
  square: { width: 1080, height: 1080, daySize: 150 },
};

function esc(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character] || character));
}

function dayNumber(start: string, proofDate: string) {
  const startAt = new Date(`${start.slice(0, 10)}T00:00:00Z`).getTime();
  const proofAt = new Date(`${proofDate.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((proofAt - startAt) / 86400000) + 1);
}

export async function GET(request: Request, { params }: { params: Promise<{ proofId: string }> }) {
  const { proofId } = await params;
  const requested = new URL(request.url).searchParams.get("format");
  const format: ShareFormat = requested === "portrait" || requested === "square" || requested === "story" ? requested : "story";
  const { width, height, daySize } = dimensions[format];

  let title = "30 DAYS STRONG";
  let slug = "30-days-strong";
  let day = 19;
  let verified = 4;
  let owner = "@proofmode";
  let receiptId = proofId.slice(0, 8);

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_receipt_share_v1", { target_receipt: proofId });
    if (error || !data) return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
    const receipt = data as ReceiptShare;
    title = receipt.challenge_title;
    slug = receipt.challenge_slug;
    day = dayNumber(receipt.challenge_created_at, receipt.proof_date);
    verified = Number(receipt.verified_count) || 0;
    owner = receipt.handle ? `@${receipt.handle}` : receipt.display_name || "ProofMode member";
    receiptId = receipt.id.slice(0, 8);
  }

  const safeTitle = esc(title.toUpperCase().slice(0, 34));
  const safeOwner = esc(owner.slice(0, 30));
  const receipt = esc(receiptId);
  const receiptPath = esc(`/r/${proofId}`.slice(0, 80));
  const inset = 58;
  const innerHeight = height - inset * 2;
  const headerY = Math.round(height * 0.075);
  const titleY = Math.round(height * 0.17);
  const dayY = Math.round(height * 0.52);
  const badgeY = Math.round(height * 0.59);
  const ownerY = Math.round(height * 0.77);
  const sloganY = Math.round(height * 0.82);
  const lineY = Math.round(height * 0.87);
  const ctaY = Math.round(height * 0.93);
  const badgeWidth = Math.min(500, width - 152);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" rx="70" fill="#d7ff3f"/><rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${innerHeight}" rx="44" fill="none" stroke="#090a0c" stroke-width="5"/><circle cx="112" cy="${headerY - 16}" r="10" fill="#090a0c"/><text x="142" y="${headerY}" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="900" fill="#090a0c">PROOFMODE · RECEIPT ${receipt}</text><text x="76" y="${titleY}" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="900" fill="#090a0c">${safeTitle}</text><text x="76" y="${dayY}" font-family="Arial,Helvetica,sans-serif" font-size="${daySize}" font-weight="900" letter-spacing="-10" fill="#090a0c">DAY ${day}.</text><rect x="76" y="${badgeY}" width="${badgeWidth}" height="74" rx="37" fill="#090a0c"/><text x="106" y="${badgeY + 52}" font-family="Arial,Helvetica,sans-serif" font-size="31" font-weight="900" fill="#d7ff3f">✓ VERIFIED × ${verified}</text><text x="76" y="${ownerY}" font-family="Arial,Helvetica,sans-serif" font-size="48" font-weight="900" fill="#090a0c">${safeOwner}</text><text x="76" y="${sloganY}" font-family="Arial,Helvetica,sans-serif" font-size="32" font-weight="800" fill="#090a0c">NO RECEIPT. NO STREAK.</text><line x1="76" y1="${lineY}" x2="1004" y2="${lineY}" stroke="#090a0c" stroke-width="4"/><text x="76" y="${ctaY}" font-family="Arial,Helvetica,sans-serif" font-size="31" font-weight="900" fill="#090a0c">BEAT ME → ${receiptPath}</text></svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="proofmode-${format}-${receiptId}.svg"`,
      "X-ProofMode-Receipt": `/r/${proofId}`,
      "X-ProofMode-Drop": `/c/${slug}`,
    },
  });
}
