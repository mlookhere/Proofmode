import Link from "next/link";
import { redirect } from "next/navigation";
import { ProofCard } from "@/components/proof-card";
import { ShareReceiptButton } from "@/components/share-receipt-button";
import { demoProofs } from "@/lib/demo";
import { proofScore } from "@/lib/growth";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type RealProof = { id: string; challenge_id: string; caption: string | null; proof_date: string; created_at: string };
type RealChallenge = { id: string; title: string; slug: string; duration_days: number; format?: string };

function currentStreak(dates: string[]) {
  const unique = [...new Set(dates)].sort().reverse();
  if (!unique.length) return 0;
  let streak = 1;
  for (let i=1;i<unique.length;i++) {
    const prev = new Date(`${unique[i-1]}T00:00:00Z`).getTime();
    const cur = new Date(`${unique[i]}T00:00:00Z`).getTime();
    if ((prev-cur)/86400000 === 1) streak++; else break;
  }
  return streak;
}

export default async function DashboardPage() {
  if (!hasSupabaseEnv()) {
    return <main className="app-wrap"><div className="app-head"><div><span className="tag">DEMO MODE</span><h1>Your mode.</h1><p>Connect Supabase to make this dashboard persistent.</p></div><Link className="btn btn-primary" href="/onboarding?mode=drop">Launch a Drop +</Link></div><div className="stat-grid" style={{marginBottom:18}}><div className="stat"><span className="muted">Proof Score</span><strong>247</strong></div><div className="stat"><span className="muted">Current streak</span><strong>19 days</strong></div><div className="stat"><span className="muted">Recruits</span><strong>7</strong></div></div><div className="dashboard-grid"><section>{demoProofs.slice(0,2).map(p=><ProofCard key={p.id} proof={p}/>)}</section><aside className="challenge-sidebar"><div className="panel"><span className="founder-pill">★ FOUNDER</span><h3>30 Days Strong</h3><p className="muted">Day 19 · your receipts are doing the recruiting.</p><Link href="/c/30-days-strong" className="btn" style={{width:"100%"}}>Open Drop</Link></div></aside></div></main>;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");
  const memberships = await supabase.from("challenge_members").select("challenge_id,founder").eq("user_id", user.id);
  const membershipRows = (memberships.data || []) as Array<{ challenge_id: string; founder?: boolean }>;
  const ids = membershipRows.map((m) => m.challenge_id);
  let challengesResult = ids.length ? await supabase.from("challenges").select("id,title,slug,duration_days,format").in("id", ids).order("created_at", { ascending: false }) : { data: [] as unknown[] };
  if ((challengesResult as { error?: unknown }).error) challengesResult = ids.length ? await supabase.from("challenges").select("id,title,slug,duration_days").in("id", ids).order("created_at", { ascending: false }) : { data: [] as unknown[] };
  const challenges = (challengesResult.data || []) as RealChallenge[];
  const proofsResult = await supabase.from("proofs").select("id,challenge_id,caption,proof_date,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(60);
  const proofs = (proofsResult.data || []) as RealProof[];
  const proofIds = proofs.map((proof) => proof.id);
  const verificationResult = proofIds.length ? await supabase.from("verifications").select("proof_id", { count: "exact", head: true }).in("proof_id", proofIds).eq("verdict", true) : { count: 0 };
  const verified = verificationResult.count || 0;
  const inviteClaims = await supabase.from("invite_claims").select("id", { count: "exact", head: true }).eq("inviter_id", user.id);
  const recruits = inviteClaims.count || 0;
  const profileResult = await supabase.from("profiles").select("handle,display_name,plan").eq("id", user.id).maybeSingle();
  const profile = profileResult.data as { handle?: string | null; display_name?: string | null; plan?: string } | null;
  const streak = currentStreak(proofs.map((p)=>p.proof_date));
  const score = proofScore(proofs.length, verified, recruits);
  const founderBadges = membershipRows.filter((m)=>m.founder).length;
  const challengeById = new Map(challenges.map((c)=>[c.id,c]));

  return (
    <main className="app-wrap wide-wrap">
      <div className="app-head dashboard-head"><div><span className="tag">LIVE ACCOUNT · {profile?.plan?.toUpperCase() || "FREE"}</span><h1>Your mode.</h1><p>{profile?.display_name || user.email} · receipts build the reputation.</p></div><div className="dashboard-actions">{profile?.handle && <Link className="btn" href={`/u/${profile.handle}`}>View passport ↗</Link>}{profile?.plan && profile.plan !== "free" && <form action="/api/billing/portal" method="post"><button className="btn" type="submit">Manage billing</button></form>}<Link className="btn btn-primary" href="/onboarding?mode=drop">Launch a Drop +</Link></div></div>
      <div className="stat-grid stat-grid-4" style={{marginBottom:18}}><div className="stat proof-score-stat"><span className="muted">Proof Score</span><strong>{score}</strong></div><div className="stat"><span className="muted">Current streak</span><strong>{streak} days</strong></div><div className="stat"><span className="muted">Founder badges</span><strong>{founderBadges}</strong></div><div className="stat"><span className="muted">People recruited</span><strong>{recruits}</strong></div></div>
      <div className="dashboard-grid">
        <section>{proofs.length ? proofs.slice(0,10).map((proof)=>{ const challenge = challengeById.get(proof.challenge_id); return <article className="proof-card" key={proof.id}><img src={`/api/media/${proof.id}`} alt="Your proof receipt" style={{width:"100%",aspectRatio:"4 / 3",objectFit:"cover",display:"block"}}/><div className="proof-body"><div className="proof-row"><div><strong>{challenge?.title || "Challenge"}</strong><div className="proof-meta">{proof.proof_date} · {proof.caption || "Receipt posted."}</div></div>{challenge && <ShareReceiptButton proofId={proof.id} slug={challenge.slug} challengeTitle={challenge.title}/>}</div></div></article>;}) : <div className="panel"><strong>No receipts yet.</strong><p className="muted">Your first proof is the moment this stops being a plan.</p>{challenges[0] ? <Link className="btn btn-primary" href={`/proofs/new?challenge=${challenges[0].id}`}>Post first receipt →</Link> : <Link className="btn btn-primary" href="/onboarding?mode=drop">Launch a Drop →</Link>}</div>}</section>
        <aside className="challenge-sidebar">{challenges.map((challenge)=>{ const founder = membershipRows.find((m)=>m.challenge_id===challenge.id)?.founder; return <div className="panel" key={challenge.id}>{founder && <span className="founder-pill">★ FOUNDER</span>}<strong className="panel-title">{challenge.title}</strong><p className="muted">{challenge.duration_days}-day {challenge.format === "drop" ? "Drop" : "challenge"}</p><div style={{display:"grid",gap:8}}><Link href={`/c/${challenge.slug}`} className="btn">Open {challenge.format === "drop" ? "Drop" : "challenge"}</Link><Link href={`/proofs/new?challenge=${challenge.id}`} className="btn btn-primary">Post receipt</Link></div></div>;})}{!challenges.length && <div className="panel"><strong>Start the room.</strong><p className="muted">A public Drop gives every invite, proof, and leaderboard movement somewhere to point back to.</p><Link className="btn btn-primary" href="/onboarding?mode=drop">Launch Drop 001 →</Link></div>}</aside>
      </div>
    </main>
  );
}
