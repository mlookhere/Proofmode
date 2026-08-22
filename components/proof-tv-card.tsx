import Link from "next/link";
import { FeedPost, feedKindLabels } from "@/lib/entertainment";

export function ProofTvCard({ post }: { post: FeedPost }) {
  return (
    <article className="tv-card">
      <div className="tv-visual" style={{ background: `radial-gradient(circle at 25% 20%, ${post.accent}55, transparent 34%), linear-gradient(145deg, #20242b, #090a0c 72%)` }}>
        <div className="tv-topline">
          <span className="tv-kind" style={{ borderColor: post.accent, color: post.accent }}>{feedKindLabels[post.kind]}</span>
          <span className="tv-day">{post.dayLabel}</span>
        </div>
        <strong className="tv-hero-value">{post.visual}</strong>
        <div className="tv-journey-track"><span style={{ background: post.accent }} /></div>
        <span className="tv-journey-label">{post.challenge} · {post.journeyStep}</span>
      </div>
      <div className="tv-copy">
        <div className="tv-author"><span className="avatar">{post.avatar}</span><div><strong>{post.displayName}</strong><span>@{post.handle}</span></div></div>
        <p>{post.caption}</p>
        <div className="tv-actions">
          <button type="button">🔥 <span>{post.reactions}</span></button>
          <button type="button">💬 <span>{post.comments}</span></button>
          <button type="button">↗ <span>Share</span></button>
        </div>
        <div className="tv-cta-row">
          <Link className="btn btn-primary" href={`/onboarding?mode=drop&source=feed&challenge=${encodeURIComponent(post.challenge)}`}>{post.action} →</Link>
          <Link className="btn btn-ghost" href="/journeys/demo">Start from Day 1</Link>
        </div>
      </div>
    </article>
  );
}
