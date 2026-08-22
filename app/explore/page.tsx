import Link from "next/link";
import { exploreTemplates } from "@/lib/entertainment";

export const metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <main className="app-wrap wide-wrap">
      <section className="explore-hero">
        <span className="eyebrow"><span className="dot" /> FIND SOMETHING WORTH TRYING</span>
        <h1>WHAT ARE YOU<br/>FEELING?</h1>
        <p>Do not make a new user invent a goal from a blank box. Give them obvious, visual starting points they can join in one tap.</p>
        <div className="interest-pills"><button>💪 Get fit</button><button>😂 Do something stupid</button><button>🚀 Build</button><button>🎨 Create</button><button>🧠 Lock in</button><button>🌱 Get outside</button><button>🎲 Surprise me</button></div>
      </section>
      <section className="section compact-section">
        <div className="section-headline"><div><span className="tag">TRENDING NOW</span><h2>START WITH A FORMAT<br/>THAT ALREADY WORKS.</h2></div><p className="section-lede">Each template tells you the rule, difficulty, proof type, and how many people are already participating.</p></div>
        <div className="explore-grid">{exploreTemplates.map((item) => <article className="explore-card" key={item.id}>
          <div className="explore-card-top"><span className="explore-emoji">{item.emoji}</span><span className="tag">{item.category}</span></div>
          <span className="explore-flavor">{item.flavor}</span><h3>{item.title}</h3><p>{item.promise}</p>
          <dl><div><dt>RUN</dt><dd>{item.duration}</dd></div><div><dt>LEVEL</dt><dd>{item.difficulty}</dd></div><div><dt>PROOF</dt><dd>{item.proof}</dd></div></dl>
          <div className="explore-bottom"><span><strong>{item.people}</strong> participating</span><Link className="btn btn-primary" href={`/onboarding?mode=drop&template=${item.id}`}>Join →</Link></div>
        </article>)}</div>
      </section>
    </main>
  );
}
