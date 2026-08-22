import Link from "next/link";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import { categoryLabels, dropTemplates } from "@/lib/growth";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type LiveDrop = {
  id: string;
  title: string;
  slug: string;
  tagline: string | null;
  category: keyof typeof categoryLabels;
  duration_days: number;
  cover_emoji: string | null;
  seat_cap: number | null;
  founder_cutoff: number;
};

type Snapshot = { member_count?: number; receipt_count?: number } | null;

export default async function DropsPage() {
  let liveDrops: Array<LiveDrop & { snapshot: Snapshot }> = [];

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const result = await supabase
      .from("challenges")
      .select("id,title,slug,tagline,category,duration_days,cover_emoji,seat_cap,founder_cutoff")
      .eq("visibility", "public")
      .eq("format", "drop")
      .order("created_at", { ascending: false })
      .limit(9);

    if (!result.error && result.data) {
      liveDrops = await Promise.all((result.data as LiveDrop[]).map(async (drop) => {
        const snapshot = await supabase.rpc("get_public_challenge_snapshot", { target_slug: drop.slug });
        return { ...drop, snapshot: (snapshot.data || null) as Snapshot };
      }));
    }
  }

  return (
    <main>
      <AnalyticsBeacon eventName="drop_view" source="drops_index" />
      <section className="shell drop-hero">
        <div>
          <span className="eyebrow"><span className="dot" /> Multiplayer accountability</span>
          <h1>JOIN A DROP.<br/>LEAVE WITH RECEIPTS.</h1>
          <p>A Drop is a time-boxed public challenge with founding members, a live proof board, rankings, and one rule everyone can understand.</p>
          <div className="hero-actions"><Link className="btn btn-primary" href="/onboarding?mode=drop">Launch a Drop →</Link><a className="btn btn-ghost" href="#live">Browse live Drops</a></div>
        </div>
        <div className="drop-poster">
          <span className="poster-kicker">PROOFMODE DROP 001</span>
          <strong>MAKE<br/>QUITTING<br/>VISIBLE.</strong>
          <div className="poster-bottom"><span>FOUNDERS GET THE BADGE</span><span>NO RECEIPT → NO STREAK</span></div>
        </div>
      </section>

      <section className="shell section" id="live">
        <div className="section-headline"><div><span className="tag">LIVE NOW</span><h2>DROPS WITH MOMENTUM.</h2></div><p className="section-lede">Small enough to feel like a room. Public enough that your progress has stakes.</p></div>
        {liveDrops.length ? <div className="drop-grid">{liveDrops.map((drop) => {
          const members = drop.snapshot?.member_count || 0;
          const receipts = drop.snapshot?.receipt_count || 0;
          return <Link className="drop-card" href={`/c/${drop.slug}`} key={drop.id}>
            <div className="drop-card-top"><span className="drop-emoji">{drop.cover_emoji || "↗"}</span><span className="tag">{categoryLabels[drop.category] || "Drop"}</span></div>
            <h3>{drop.title}</h3><p>{drop.tagline || "A public challenge with receipts required."}</p>
            <div className="drop-metrics"><span><strong>{members}</strong> in</span><span><strong>{receipts}</strong> receipts</span><span><strong>{drop.duration_days}d</strong> run</span></div>
            <div className="drop-enter">Enter Drop <span>→</span></div>
          </Link>;
        })}</div> : <div className="empty-drop"><span className="tag">BE FIRST</span><h3>No public Drops are live in this database yet.</h3><p>Launch the first one, then every invite and receipt becomes distribution for the same landing page.</p><Link className="btn btn-primary" href="/onboarding?mode=drop&template=ship-daily">Launch Drop 001 →</Link></div>}
      </section>

      <section className="shell section">
        <span className="tag">DROP RECIPES</span><h2>STEAL A FORMAT<br/>THAT ALREADY MAKES SENSE.</h2>
        <div className="drop-grid template-grid">{dropTemplates.map((template) => <Link className="drop-card template-card" key={template.id} href={`/onboarding?mode=drop&template=${template.id}`}>
          <div className="drop-card-top"><span className="drop-emoji">{template.emoji}</span><span className="tag">{categoryLabels[template.category]}</span></div>
          <h3>{template.title}</h3><p>{template.hook}</p><div className="template-rule">{template.duration} DAYS · {template.tagline}</div><div className="drop-enter">Launch this format <span>→</span></div>
        </Link>)}</div>
      </section>
    </main>
  );
}
