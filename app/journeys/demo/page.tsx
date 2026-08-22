import Link from "next/link";

const chapters = [
  ["DAY 1", "PROOF", "Started ugly. Exactly the point.", "✓"],
  ["DAY 7", "PROOF", "First week. Still here.", "7"],
  ["DAY 12", "FAIL", "Alarm won. Posting the loss.", "×"],
  ["DAY 13", "COMEBACK", "Miss once. Never disappear twice.", "↗"],
  ["DAY 21", "PR", "Longest streak I've ever held.", "21"],
] as const;

export const metadata = { title: "Journey demo" };

export default function JourneyDemoPage() {
  return <main className="app-wrap journey-page"><section className="journey-hero"><div><span className="tag">FOLLOW THE STORY, NOT JUST THE ACCOUNT</span><h1>45 MINUTE<br/>LOCK-IN</h1><p>Tori's third attempt became the one people started watching.</p></div><div className="journey-score"><span>ATTEMPT</span><strong>#3</strong><small>21 chapters · 18 verified</small></div></section><section className="journey-timeline">{chapters.map(([day,kind,caption,value],index)=><article className="journey-chapter" key={day}><div className="journey-index">{String(index+1).padStart(2,"0")}</div><div className="journey-mini"><span>{kind}</span><strong>{value}</strong></div><div><span className="muted">{day}</span><h2>{caption}</h2><div className="receipt-actions"><button className="btn">🔥 Respect</button><button className="btn">💬 Comment</button>{index===2 && <button className="btn">↻ Run it back</button>}</div></div></article>)}</section><section className="panel journey-cta"><div><span className="tag">YOUR TURN</span><h2>Don't just finish the story. Enter it.</h2></div><Link className="btn btn-primary" href="/onboarding?mode=drop&template=deep-work-14">Try this challenge →</Link></section></main>;
}
