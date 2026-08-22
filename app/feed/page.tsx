import Link from "next/link";
import { ProofTvCard } from "@/components/proof-tv-card";
import { demoFeed } from "@/lib/entertainment";

export const metadata = { title: "ProofTV" };

export default function FeedPage() {
  return (
    <main className="tv-page">
      <div className="tv-shell">
        <aside className="tv-sidebar">
          <span className="eyebrow"><span className="dot" /> PROOFTV</span>
          <h1>WATCH.<br/>THEN TRY.</h1>
          <p>Proof, fails, comebacks, chaos, and the stories behind real attempts. Every post has a doorway into participation.</p>
          <div className="tv-filter-list">
            <button className="active">For You</button><button>Following</button><button>Fails 😂</button><button>Comebacks</button><button>Friends</button>
          </div>
          <Link className="btn btn-primary" href="/create">Post something →</Link>
        </aside>
        <section className="tv-feed" aria-label="ProofTV demo feed">
          {demoFeed.map((post) => <ProofTvCard post={post} key={post.id} />)}
          <div className="tv-end-card"><strong>THE FEED SHOULD END IN ACTION.</strong><p>Not “you watched 47 minutes.” More like “you found the thing you want to try next.”</p><Link className="btn btn-primary" href="/explore">Find your challenge →</Link></div>
        </section>
      </div>
    </main>
  );
}
