import type { Metadata } from "next";
import Link from "next/link";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import { InviteButton } from "@/components/invite-button";
import { ShareReceiptButton } from "@/components/share-receipt-button";
import { VerifyButton } from "@/components/verify-button";
import { categoryLabels } from "@/lib/growth";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type Challenge = {
  id: string;
  owner_id: string;
  title: string;
  slug: string;
  rule: string;
  duration_days: number;
  visibility: string;
  format?: "crew" | "drop";
  category?: keyof typeof categoryLabels;
  tagline?: string | null;
  seat_cap?: number | null;
  founder_cutoff?: number;
  cover_emoji?: string | null;
};

type Proof = { id: string; user_id: string; caption: string | null; proof_date: string; created_at: string };
type Leader = { user_id: string; display_name: string; handle: string | null; founder: boolean; receipts: number; verified_receipts: number; proof_score: number; rank: number };
type Snapshot = { member_count: number; receipt_count: number; verified_receipt_count: number; leaderboard: Leader[] };
type Profile = { display_name: string | null; handle: string | null };

async function loadChallenge(slug: string) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const modern = await supabase.from("challenges").select("id,owner_id,title,slug,rule,duration_days,visibility,format,category,tagline,seat_cap,founder_cutoff,cover_emoji").eq("slug", slug).maybeSingle();
  if (!modern.error) return modern.data as Challenge | null;
  const legacy = await supabase.from("challenges").select("id,owner_id,title,slug,rule,duration_days,visibility").eq("slug", slug).maybeSingle();
  return legacy.data as Challenge | null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const challenge = await loadChallenge(slug);
  const title = challenge?.title || slug.replaceAll("-", " ").toUpperCase();
  const description = challenge?.tagline || challenge?.rule || "Join the challenge. Post the proof. Keep the streak if your crew verifies it.";
  return {
    title: `${title} — join the Drop`,
    description,
    openGraph: { title: `${title} · ProofMode`, description, type: "website" },
    twitter: { card: "summary_large_image", title: `${title} · ProofMode`, description }
  };
}

export default async function ChallengePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ ref?: string; joined?: string; launched?: string; error?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  let challenge = await loadChallenge(slug);
  let snapshot: Snapshot | null = null;
  let proofs: Proof[] = [];
  let posterProfiles = new Map<string, Profile>();
  let host: Profile | null = null;
  let viewerIsMember = false;
  let viewerFounder = false;
  let viewerInviteWins = 0;

  if (!challenge && query.ref && hasSupabaseEnv()) {
    const supabase = await createClient();
    const landing = await supabase.rpc("get_challenge_landing", { target_slug: slug, target_invite_code: query.ref });
    if (!landing.error && landing.data) challenge = landing.data as Challenge;
  }

  if (hasSupabaseEnv() && challenge) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const snap = await supabase.rpc("get_public_challenge_snapshot", { target_slug: slug });
    if (!snap.error && snap.data) snapshot = snap.data as Snapshot;

    const recent = await supabase.from("proofs").select("id,user_id,caption,proof_date,created_at").eq("challenge_id", challenge.id).order("created_at", { ascending: false }).limit(18);
    proofs = (recent.data || []) as Proof[];
    const userIds = [...new Set(proofs.map((proof) => proof.user_id))];
    if (userIds.length) {
      const profiles = await supabase.from("profiles").select("id,display_name,handle").in("id", userIds);
      posterProfiles = new Map((profiles.data || []).map((profile: { id: string; display_name: string | null; handle: string | null }) => [profile.id, { display_name: profile.display_name, handle: profile.handle }]));
    }
    const hostResult = await supabase.from("profiles").select("display_name,handle").eq("id", challenge.owner_id).maybeSingle();
    host = (hostResult.data || null) as Profile | null;
    if (user) {
      const membership = await supabase.from("challenge_members").select("founder").eq("challenge_id", challenge.id).eq("user_id", user.id).maybeSingle();
      viewerIsMember = Boolean(membership.data);
      viewerFounder = Boolean(membership.data?.founder);
      const claims = await supabase.from("invite_claims").select("id", { count: "exact", head: true }).eq("challenge_id", challenge.id).eq("inviter_id", user.id);
      viewerInviteWins = claims.count || 0;
    }
  }

  if (!challenge) {
    challenge = {
      id: "demo-challenge",
      owner_id: "demo-owner",
      slug,
      title: slug === "30-days-strong" ? "30 DAYS STRONG" : slug.replaceAll("-", " ").toUpperCase(),
      rule: "Move 30+ minutes daily. Post proof before midnight.",
      duration_days: 30,
      visibility: "public",
      format: "drop",
      category: "fitness",
      tagline: "Thirty minutes. Every day. Receipts required.",
      seat_cap: 25,
      founder_cutoff: 5,
      cover_emoji: "🏁"
    };
    snapshot = {
      member_count: 18,
      receipt_count: 143,
      verified_receipt_count: 117,
      leaderboard: [
        { user_id: "1", display_name: "Maya", handle: "mayamoves", founder: true, receipts: 19, verified_receipts: 18, proof_score: 218, rank: 1 },
        { user_id: "2", display_name: "Chris", handle: "christrains", founder: true, receipts: 18, verified_receipts: 18, proof_score: 216, rank: 2 },
        { user_id: "3", display_name: "Dani", handle: "danimoves", founder: false, receipts: 18, verified_receipts: 17, proof_score: 206, rank: 3 },
        { user_id: "4", display_name: "Leo", handle: "leoafterwork", founder: false, receipts: 15, verified_receipts: 14, proof_score: 170, rank: 4 }
      ]
    };
  }

  const memberCount = snapshot?.member_count || 0;
  const receiptCount = snapshot?.receipt_count || proofs.length;
  const verifiedCount = snapshot?.verified_receipt_count || 0;
  const seatCap = challenge.seat_cap || null;
  const fill = seatCap ? Math.min(100, Math.round((memberCount / seatCap) * 100)) : Math.min(100, memberCount * 4);
  const founderCutoff = challenge.founder_cutoff || 5;
  const founderSpots = Math.max(0, founderCutoff - memberCount);
  const category = challenge.category ? categoryLabels[challenge.category] : "Challenge";
  const formatLabel = challenge.format === "drop" ? "LIVE DROP" : "CHALLENGE";
  const verificationRate = receiptCount ? Math.round((verifiedCount / receiptCount) * 100) : 0;

  return (
    <main className="app-wrap wide-wrap">
      <AnalyticsBeacon eventName="drop_view" source="challenge_page" properties={{ slug: challenge.slug }} />
      {query.launched && <div className="success launch-success"><strong>Drop launched.</strong> Post the first receipt, then invite three people before the room goes cold.</div>}
      {query.joined && <div className="success launch-success"><strong>You’re in.</strong> Your first receipt is now the only thing that matters.</div>}
      {query.error === "invite_required" && <div className="error launch-success">This crew requires a valid member invite.</div>}

      <div className="challenge-hero challenge-hero-v2">
        <section className="challenge-box drop-box">
          <div className="drop-box-head"><div><span className="drop-live-dot" /> {formatLabel} · {category} · {challenge.duration_days} DAYS</div><span className="drop-symbol">{challenge.cover_emoji || "↗"}</span></div>
          <div><h1>{challenge.title}</h1><p className="challenge-tagline">{challenge.tagline || challenge.rule}</p></div>
          <div>
            <div className="momentum-label"><span>{memberCount} in · {receiptCount} receipts</span><span>{seatCap ? `${Math.max(0, seatCap-memberCount)} seats left` : "open crew"}</span></div>
            <div className="momentum-track"><span style={{width:`${fill}%`}} /></div>
            <div className="drop-rule"><span>THE RECEIPT RULE</span><strong>{challenge.rule}</strong></div>
          </div>
        </section>

        <aside className="challenge-sidebar">
          <div className="panel join-panel">
            {founderSpots > 0 ? <span className="founder-pill">★ {founderSpots} FOUNDER {founderSpots === 1 ? "BADGE" : "BADGES"} LEFT</span> : <span className="tag">THE DROP IS MOVING</span>}
            <h2>{viewerIsMember ? "Bring someone who’ll hate losing to you." : "Don’t spectate."}</h2>
            <p className="muted">{viewerIsMember ? `You’ve recruited ${viewerInviteWins}. Every invite carries your attribution into the Drop.` : "Joining makes your progress visible to the crew. Your streak only advances when there’s a receipt."}</p>
            {viewerIsMember ? <InviteButton challengeId={challenge.id} slug={challenge.slug} title={challenge.title} /> : <form action="/api/join" method="post"><input type="hidden" name="slug" value={slug} /><input type="hidden" name="inviteCode" value={query.ref || ""} /><button className="btn btn-primary" style={{width:"100%"}} type="submit">Join this Drop →</button></form>}
            {viewerFounder && <div className="founder-status">★ FOUNDER STATUS LOCKED</div>}
            {challenge.id !== "demo-challenge" && viewerIsMember && <Link className="btn" style={{width:"100%"}} href={`/proofs/new?challenge=${challenge.id}`}>Post today’s receipt</Link>}
            {host && <p className="host-line">Hosted by {host.handle ? <Link href={`/u/${host.handle}`}>@{host.handle}</Link> : host.display_name || "a ProofMode creator"}</p>}
          </div>

          <div className="panel scoreboard">
            <div className="scoreboard-head"><strong>PROOF BOARD</strong><span className="muted">score = verified receipts</span></div>
            {(snapshot?.leaderboard || []).length ? snapshot!.leaderboard.map((member) => <div className="leader-row" key={member.user_id}>
              <span className="rank">{String(member.rank).padStart(2,"0")}</span>
              <div className="leader-name"><strong>{member.handle ? <Link href={`/u/${member.handle}`}>{member.display_name}</Link> : member.display_name}</strong><span>{member.founder ? "★ Founder" : `${member.receipts} receipts`}</span></div>
              <strong className="proof-score">{member.proof_score}</strong>
            </div>) : <p className="muted">First receipt takes the top spot.</p>}
          </div>
        </aside>
      </div>

      <section className="signal-strip">
        <div><span>MEMBERS</span><strong>{memberCount}</strong></div>
        <div><span>RECEIPTS</span><strong>{receiptCount}</strong></div>
        <div><span>VERIFIED</span><strong>{verificationRate}%</strong></div>
        <div><span>FOUNDER CUT</span><strong>FIRST {founderCutoff}</strong></div>
      </section>

      <section className="section receipts-section">
        <div className="section-headline"><div><span className="tag">LIVE EVIDENCE</span><h2>THE ROOM<br/>HAS RECEIPTS.</h2></div><p className="section-lede">This is the feed that matters: what people said they would do, followed by what they actually did.</p></div>
        {proofs.length > 0 ? <div className="receipt-grid">{proofs.map((proof) => {
          const poster = posterProfiles.get(proof.user_id);
          return <article className="proof-card receipt-tile" key={proof.id}>
            <img src={`/api/media/${proof.id}`} alt="Challenge proof" />
            <div className="proof-body"><div className="receipt-owner"><div><strong>{poster?.display_name || "ProofMode member"}</strong>{poster?.handle && <Link href={`/u/${poster.handle}`}>@{poster.handle}</Link>}</div><span>{proof.proof_date}</span></div><p className="muted">{proof.caption || "Receipt posted."}</p><div className="receipt-actions"><VerifyButton proofId={proof.id}/><ShareReceiptButton proofId={proof.id} slug={challenge.slug} challengeTitle={challenge.title}/></div></div>
          </article>;
        })}</div> : <div className="empty-drop"><span className="tag">OPENING MOVE</span><h3>No receipts yet.</h3><p>The first person to post gets the cleanest possible flex: rank #1.</p>{viewerIsMember && challenge.id !== "demo-challenge" && <Link className="btn btn-primary" href={`/proofs/new?challenge=${challenge.id}`}>Take rank #1 →</Link>}</div>}
      </section>
    </main>
  );
}
