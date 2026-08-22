import Link from "next/link";
import { AnalyticsBeacon } from "@/components/analytics-beacon";
import { ProofCard } from "@/components/proof-card";
import { demoProofs } from "@/lib/demo";
import { dropTemplates } from "@/lib/growth";

export default function Home() {
  return (
    <>
      <main>
        <AnalyticsBeacon eventName="landing_view" source="home" />
        <section className="shell hero hero-v2">
          <div>
            <div className="eyebrow"><span className="dot" /> the participation network</div>
            <h1>DON’T POST<br/>THE PLAN.<br/><span>POST THE PROOF.</span></h1>
            <p>Watch wins, fails, comebacks and chaos. Tap anything worth trying, enter the challenge behind it, then post what actually happened.</p>
            <div className="hero-actions">
              <Link className="btn btn-primary btn-xl" href="/feed">Watch ProofTV →</Link>
              <Link className="btn btn-ghost" href="/explore">Find something to try</Link>
            </div>
            <div className="hero-proof-points"><span>✓ Proof + fails</span><span>✓ Real comebacks</span><span>✓ Every post can become a challenge</span></div>
          </div>
          <div className="war-room" aria-label="ProofMode Drop preview">
            <div className="war-room-top"><span className="live-pill"><i/> DROP LIVE</span><span>30 DAYS STRONG · DAY 19</span></div>
            <div className="war-title"><span>🏁</span><strong>THE ROOM<br/>HAS RECEIPTS.</strong></div>
            <div className="war-stats"><div><span>IN</span><strong>18</strong></div><div><span>RECEIPTS</span><strong>143</strong></div><div><span>VERIFIED</span><strong>82%</strong></div></div>
            <div className="war-leader"><span>#01</span><div><strong>Maya</strong><small>★ Founder · 19 receipts</small></div><b>218</b></div>
            <div className="war-leader"><span>#02</span><div><strong>Chris</strong><small>★ Founder · 18 receipts</small></div><b>216</b></div>
            <div className="war-cta">JOIN BEFORE THE NEXT RECEIPT <span>→</span></div>
          </div>
        </section>

        <div className="marquee"><div className="marquee-track">SHIP DAILY • 30 DAYS STRONG • DEEP WORK 14 • 100 SKETCHES • READ 20 • REACH OUT 7 • RECEIPTS &gt; INTENTIONS • SHIP DAILY • 30 DAYS STRONG •</div></div>

        <section className="shell section">
          <div className="section-headline"><div><span className="tag">WHY IT SPREADS</span><h2>THE PRODUCT<br/>DISTRIBUTES ITSELF.</h2></div><p className="section-lede">Every core action creates a reason for somebody else to enter the same loop. The growth mechanic is the product, not a referral pop-up bolted onto it.</p></div>
          <div className="loop-grid">
            <div className="loop-card"><span>01</span><strong>WATCH</strong><p>The feed is entertainment even when you are not ready to participate.</p></div>
            <div className="loop-arrow">→</div>
            <div className="loop-card"><span>02</span><strong>TRY</strong><p>Every good post exposes the challenge behind it in one tap.</p></div>
            <div className="loop-arrow">→</div>
            <div className="loop-card"><span>03</span><strong>POST</strong><p>Proof, failure, chaos and comebacks all become native content.</p></div>
            <div className="loop-arrow">→</div>
            <div className="loop-card hot-card"><span>04</span><strong>CHALLENGE</strong><p>Share cards, rivalries and callouts pull the next participant in.</p></div>
          </div>
        </section>

        <section className="shell section passport-promo">
          <div className="passport-demo">
            <div className="passport-demo-head"><div className="passport-mark">P</div><div><span>RECEIPT PASSPORT</span><strong>@mayamoves</strong></div></div>
            <div className="passport-demo-score"><small>PROOF SCORE</small><b>247</b></div>
            <div className="passport-demo-stats"><span>42 RECEIPTS</span><span>37 VERIFIED</span><span>3 ★ FOUNDER</span><span>7 RECRUITS</span></div>
            <div className="passport-demo-foot">PUBLIC PROOF &gt; PERSONAL BRAND</div>
          </div>
          <div><span className="eyebrow"><span className="dot" /> identity that compounds</span><h2>YOUR RECEIPTS BECOME<br/>A REPUTATION LAYER.</h2><p className="section-lede">Profiles aren’t built from bios and follower counts. ProofMode passports show verified work, founder status, and who you brought into the room.</p><div className="hero-actions"><Link className="btn btn-primary" href="/feed">Watch the product loop →</Link></div></div>
        </section>

        <section className="shell section">
          <div className="section-headline"><div><span className="tag">STEAL THE FORMAT</span><h2>LAUNCH SOMETHING<br/>PEOPLE CAN SAY IN ONE BREATH.</h2></div><Link className="btn" href="/drops">Browse all Drops →</Link></div>
          <div className="drop-grid home-template-grid">{dropTemplates.slice(0,6).map((template) => <Link className="drop-card template-card" key={template.id} href={`/onboarding?mode=drop&template=${template.id}`}><div className="drop-card-top"><span className="drop-emoji">{template.emoji}</span><span className="tag">{template.duration} DAYS</span></div><h3>{template.title}</h3><p>{template.hook}</p><div className="drop-enter">Launch it <span>→</span></div></Link>)}</div>
        </section>

        <section className="shell section" id="how">
          <span className="tag">THE MECHANIC</span><h2>NO RECEIPT.<br/>NO STREAK.</h2>
          <div className="grid-3">
            <div className="card"><div className="card-number">01 — DROP</div><h3>Launch a room with a flag.</h3><p>Public Drops have a category, seat cap, founder cutoff, leaderboard, and one measurable proof rule.</p></div>
            <div className="card"><div className="card-number">02 — RECEIPT</div><h3>Evidence is the content format.</h3><p>Photos become timestamped receipts. Crew verification increases Proof Score and keeps the board honest.</p></div>
            <div className="card"><div className="card-number">03 — RIVALRY</div><h3>Status creates the return loop.</h3><p>Founders, ranks, recruits, and Passport scores give people something meaningful to protect and improve.</p></div>
          </div>
        </section>

        <section className="shell section final-cta">
          <span className="tag">DROP 001</span><h2>MAKE SOMETHING<br/>PEOPLE WANT TO<br/>PROVE THEY’RE IN.</h2><p>Start with five people. If the content is entertaining and participation is one tap away, the feed becomes the acquisition loop.</p><div className="hero-actions"><Link className="btn btn-primary btn-xl" href="/onboarding?mode=drop">Launch free →</Link><Link className="btn" href="/pricing">See creator plan</Link></div>
        </section>
      </main>
      <footer className="footer"><div className="shell footer-inner"><span>© 2026 ProofMode. Proof over performance.</span><span>Privacy · Terms · Community rules</span></div></footer>
    </>
  );
}
