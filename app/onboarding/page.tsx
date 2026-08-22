import Link from "next/link";
import { categoryLabels, dropTemplates, templateById } from "@/lib/growth";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ mode?: string; template?: string }> }) {
  const params = await searchParams;
  const selected = templateById(params.template);
  const isDrop = params.mode === "drop" || Boolean(selected);

  return (
    <main className="app-wrap" style={{maxWidth:820}}>
      <div className="app-head"><div><span className="tag">{isDrop ? "LAUNCH A DROP" : "45-SECOND SETUP"}</span><h1>{isDrop ? "Give people a flag to rally around." : "Declare the thing."}</h1><p>{isDrop ? "The best public challenges have one obvious rule, a sharp identity, and a reason to join now." : "Specific beats inspirational. Your crew needs to know what counts."}</p></div></div>
      <div className="panel">
        <form className="form" action="/api/challenges" method="post">
          <input type="hidden" name="format" value={isDrop ? "drop" : "crew"} />
          <div className="field"><label htmlFor="title">Challenge name</label><input id="title" name="title" required maxLength={60} defaultValue={selected?.title} placeholder="SHIP DAILY" /></div>
          {isDrop && <div className="field"><label htmlFor="tagline">One-line rally cry</label><input id="tagline" name="tagline" maxLength={120} defaultValue={selected?.tagline} placeholder="One visible thing out the door every day." /></div>}
          <div className="field"><label htmlFor="rule">What counts as proof?</label><textarea id="rule" name="rule" required maxLength={240} defaultValue={selected?.rule} placeholder="Move for at least 30 minutes and upload a photo, workout screenshot, or activity link before midnight." /></div>
          <div className="form-split">
            <div className="field"><label htmlFor="duration">Duration</label><select id="duration" name="duration" defaultValue={String(selected?.duration || 30)}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option><option value="60">60 days</option><option value="100">100 days</option></select></div>
            <div className="field"><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={selected?.category || "other"}>{Object.entries(categoryLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></div>
          </div>
          {isDrop ? <>
            <input type="hidden" name="visibility" value="public" />
            <div className="form-split">
              <div className="field"><label htmlFor="seatCap">Seat cap</label><select id="seatCap" name="seatCap" defaultValue="25"><option value="5">5 — intimate</option><option value="25">25 — crew</option><option value="100">100 — community</option><option value="100000">Unlimited*</option></select></div>
              <div className="field"><label htmlFor="founderCutoff">Founder badges</label><select id="founderCutoff" name="founderCutoff" defaultValue="5"><option value="3">First 3</option><option value="5">First 5</option><option value="10">First 10</option><option value="25">First 25</option></select></div>
            </div>
            <div className="field"><label htmlFor="coverEmoji">Drop mark</label><input id="coverEmoji" name="coverEmoji" maxLength={8} defaultValue={selected?.emoji || "↗"} placeholder="↗" /></div>
            <div className="launch-note"><strong>Built-in urgency without fake scarcity.</strong><span>Founder badges go to the actual first members. Seat caps are enforced by plan and database rules.</span></div>
          </> : <div className="field"><label htmlFor="visibility">Visibility</label><select id="visibility" name="visibility" defaultValue="crew"><option value="crew">Crew only</option><option value="public">Public — anyone can join</option><option value="private">Private — invite link required</option></select></div>}
          <button className="btn btn-primary" type="submit">{isDrop ? "Launch the Drop →" : "Create my challenge →"}</button>
          <p className="micro">*Creator plan supports large public Drops. Free and Pro limits are enforced server-side.</p>
        </form>
      </div>
      {isDrop && <section className="mini-templates"><span className="muted">Try another format:</span>{dropTemplates.slice(0,4).map((template) => <Link key={template.id} href={`/onboarding?mode=drop&template=${template.id}`}>{template.emoji} {template.title}</Link>)}</section>}
      <p className="muted" style={{marginTop:18}}>Already have a crew? <Link href="/login" style={{color:"var(--hot)"}}>Sign in</Link>.</p>
    </main>
  );
}
