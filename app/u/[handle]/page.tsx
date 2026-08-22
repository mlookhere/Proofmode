import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type Profile = { id: string; handle: string; display_name: string | null; bio: string | null; created_at: string };
type Snapshot = { receipts: number; verified_receipts: number; founder_badges: number; recruits: number; proof_score: number };
type Proof = { id: string; challenge_id: string; caption: string | null; proof_date: string };
type Challenge = { id: string; title: string; slug: string };

async function loadProfile(handle: string) {
  if (!hasSupabaseEnv()) return null;
  const supabase = await createClient();
  const result = await supabase.from("profiles").select("id,handle,display_name,bio,created_at").eq("handle", handle).maybeSingle();
  return result.data as Profile | null;
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const profile = await loadProfile(handle);
  return {
    title: profile ? `${profile.display_name || `@${handle}`} — Receipt Passport` : "Receipt Passport",
    description: profile?.bio || `See @${handle}'s public ProofMode receipts, verified proof score, and founder badges.`
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  if (!hasSupabaseEnv()) {
    return <main className="app-wrap passport"><div className="passport-head"><span className="passport-mark">P</span><div><span className="tag">RECEIPT PASSPORT</span><h1>@{handle}</h1><p>Connect Supabase to render live public proof history.</p></div></div></main>;
  }

  const supabase = await createClient();
  const profile = await loadProfile(handle);
  if (!profile) notFound();

  const snapResult = await supabase.rpc("get_profile_snapshot", { target_handle: handle });
  const snapshot = (snapResult.data || { receipts: 0, verified_receipts: 0, founder_badges: 0, recruits: 0, proof_score: 0 }) as Snapshot;
  const proofResult = await supabase.from("proofs").select("id,challenge_id,caption,proof_date").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(12);
  const proofs = (proofResult.data || []) as Proof[];
  const challengeIds = [...new Set(proofs.map((proof) => proof.challenge_id))];
  const challengeResult = challengeIds.length ? await supabase.from("challenges").select("id,title,slug").in("id", challengeIds) : { data: [] };
  const challenges = (challengeResult.data || []) as Challenge[];
  const byId = new Map(challenges.map((challenge) => [challenge.id, challenge]));
  const since = new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return <main className="app-wrap wide-wrap passport">
    <section className="passport-hero">
      <div className="passport-head"><span className="passport-mark">P</span><div><span className="tag">RECEIPT PASSPORT · SINCE {since.toUpperCase()}</span><h1>{profile.display_name || `@${profile.handle}`}</h1><p>@{profile.handle}{profile.bio ? ` · ${profile.bio}` : " · public proof, not promises."}</p></div></div>
      <div className="passport-score"><span>PROOF SCORE</span><strong>{snapshot.proof_score}</strong><small>verified receipts + consistency + recruits</small></div>
    </section>

    <section className="signal-strip passport-signals">
      <div><span>PUBLIC RECEIPTS</span><strong>{snapshot.receipts}</strong></div>
      <div><span>VERIFIED</span><strong>{snapshot.verified_receipts}</strong></div>
      <div><span>FOUNDER BADGES</span><strong>{snapshot.founder_badges}</strong></div>
      <div><span>RECRUITS</span><strong>{snapshot.recruits}</strong></div>
    </section>

    <section className="section receipts-section">
      <div className="section-headline"><div><span className="tag">PUBLIC HISTORY</span><h2>THE RECEIPTS<br/>SPEAK FIRST.</h2></div><p className="section-lede">Only proof from public challenges appears here. Private crews stay private.</p></div>
      {proofs.length ? <div className="receipt-grid">{proofs.map((proof) => {
        const challenge = byId.get(proof.challenge_id);
        return <article className="proof-card receipt-tile" key={proof.id}><img src={`/api/media/${proof.id}`} alt="Public ProofMode receipt"/><div className="proof-body"><strong>{challenge?.title || "Public challenge"}</strong><p className="muted">{proof.caption || "Receipt posted."}</p><div className="receipt-owner"><span>{proof.proof_date}</span>{challenge && <Link href={`/c/${challenge.slug}`}>Enter challenge →</Link>}</div></div></article>;
      })}</div> : <div className="empty-drop"><span className="tag">CLEAN SLATE</span><h3>No public receipts yet.</h3><p>Private crew activity never appears on the public passport.</p></div>}
    </section>
  </main>;
}
