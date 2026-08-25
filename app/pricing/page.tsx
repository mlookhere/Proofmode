function CheckoutButton({ plan, label, primary = false }: { plan: "proof_plus" | "creator"; label: string; primary?: boolean }) {
  return <form action="/api/checkout" method="post"><input type="hidden" name="plan" value={plan} /><button className={`btn ${primary ? "btn-primary" : ""}`} type="submit">{label}</button></form>;
}

export default function PricingPage() {
  return (
    <main className="shell section pricing-page">
      <span className="tag">PRICING</span>
      <h1 style={{fontSize:72,marginTop:18}}>Proof is free.<br/>Power is optional.</h1>
      <p className="section-lede">The free network has to be good enough to become culture. Paid plans sell identity, deeper tools, and creator leverage—never Proof Score, verification, or fake status.</p>
      <div className="pricing">
        <div className="price-card">
          <span className="tag">FREE · PARTICIPATE</span><div className="price">$0</div>
          <ul><li>ProofTV + Explore</li><li>Join public Drops and basic Crews</li><li>Proof, fails, comebacks and reactions</li><li>Receipt Passport + verified history</li><li>Native sharing and challenges</li></ul>
          <a className="btn" href="/explore">Find something to try</a>
        </div>
        <div className="price-card featured">
          <span className="tag">PROOF+ · MAKE IT YOURS</span><div className="price">$9.99 <span>/ month target</span></div>
          <ul><li>Premium Passport + receipt identity</li><li>Deeper history and personal analytics</li><li>Private social controls and more Crews</li><li>Seasonal cosmetic drops</li><li>Early feature access</li></ul>
          <CheckoutButton plan="proof_plus" label="Get Proof+" primary />
        </div>
        <div className="price-card">
          <span className="tag">CREATOR · TURN REACH INTO PARTICIPATION</span><div className="price">$39 <span>/ month target</span></div>
          <ul><li>Larger recurring Drops</li><li>Creator landing pages and branding</li><li>Activation/referral analytics</li><li>Co-hosting and scheduling</li><li>Community moderation tools</li></ul>
          <CheckoutButton plan="creator" label="Start Creator" />
        </div>
      </div>
      <div className="pricing-note"><strong>ProofMode Black</strong><span>A small private membership for selected creators, athletes, founders and cultural leaders. Invitation-only. There is no public application.</span></div>
    </main>
  );
}
