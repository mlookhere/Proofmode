import Link from "next/link";
import { createModes, exploreTemplates } from "@/lib/entertainment";

export const metadata = { title: "Create" };

export default function CreatePage() {
  return (
    <main className="app-wrap create-page">
      <section className="app-head"><div><span className="eyebrow"><span className="dot" /> ONE BUTTON. SIX HUMAN OUTCOMES.</span><h1>WHAT HAPPENED?</h1><p>Posting should never require pretending everything went perfectly.</p></div></section>
      <div className="create-mode-grid">{createModes.map((mode) => <Link className="create-mode" href={`/login?next=/create&kind=${mode.kind}`} key={mode.kind}><span>{mode.icon}</span><div><strong>{mode.label}</strong><p>{mode.helper}</p></div></Link>)}</div>
      <section className="panel create-helper"><span className="tag">NO CHALLENGE YET?</span><h2>I'M BORED.</h2><p>Pick something instantly instead of filling out a form.</p><div className="quick-picks">{exploreTemplates.slice(0,3).map(t => <Link href={`/onboarding?mode=drop&template=${t.id}`} key={t.id}><span>{t.emoji}</span><strong>{t.title}</strong><small>{t.duration} · {t.difficulty}</small></Link>)}</div><Link className="btn btn-primary" href="/explore">Give me more ideas →</Link></section>
    </main>
  );
}
