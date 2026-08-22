import type { DemoProof } from "@/lib/demo";

export function ProofCard({ proof }: { proof: DemoProof }) {
  return (
    <article className="proof-card">
      <div className="proof-image" style={{ backgroundImage: `url(${proof.image})` }}>
        <span className="stamp">✓ VERIFIED × {proof.verifiedBy}</span>
      </div>
      <div className="proof-body">
        <div className="proof-row">
          <div>
            <div className="proof-user">{proof.user} <span className="muted">{proof.handle}</span></div>
            <div className="proof-meta">{proof.challenge} · {proof.caption}</div>
          </div>
          <div className="streak">DAY {proof.day}</div>
        </div>
      </div>
    </article>
  );
}
