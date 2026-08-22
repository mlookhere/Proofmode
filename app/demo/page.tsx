import Link from "next/link";
import { ProofCard } from "@/components/proof-card";
import { demoMembers, demoProofs } from "@/lib/demo";

export default function DemoPage() {
  return (
    <main className="app-wrap">
      <div className="app-head"><div><span className="tag">INTERACTIVE PRODUCT DEMO</span><h1>Today&apos;s receipts</h1><p>See the core loop without creating an account.</p></div><Link className="btn btn-primary" href="/onboarding">Create yours →</Link></div>
      <div className="dashboard-grid">
        <section>
          {demoProofs.map((proof) => <ProofCard key={proof.id} proof={proof} />)}
        </section>
        <aside className="challenge-sidebar">
          <div className="panel">
            <div className="proof-row"><strong>30 Days Strong</strong><span className="tag">DAY 19</span></div>
            <p className="muted">Move for 30+ minutes every day. Post the receipt before midnight.</p>
            <div style={{marginTop:18}}>{demoMembers.map((m)=><div className="member-row" key={m.name}><div className="member"><div className="avatar">{m.initials}</div><strong>{m.name}</strong></div><span className="streak" style={{fontSize:15}}>{m.streak}d</span></div>)}</div>
          </div>
          <div className="panel"><strong>Viral mechanic</strong><p className="muted">Every verified check-in becomes a social receipt. The CTA on the card joins the same challenge, so sharing doubles as acquisition.</p><Link className="btn btn-primary" href="/c/30-days-strong">Open public challenge</Link></div>
        </aside>
      </div>
    </main>
  );
}
