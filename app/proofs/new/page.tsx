export default async function NewProofPage({ searchParams }: { searchParams: Promise<{ challenge?: string }> }) {
  const { challenge = "" } = await searchParams;
  return (
    <main className="app-wrap" style={{maxWidth:680}}>
      <div className="app-head"><div><span className="tag">DROP A RECEIPT</span><h1>Show the proof.</h1><p>Images are private in storage and served through short-lived signed URLs.</p></div></div>
      <div className="panel">
        <form className="form" action="/api/proofs" method="post" encType="multipart/form-data">
          <input type="hidden" name="challengeId" value={challenge} />
          <div className="field"><label htmlFor="file">Proof image</label><input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required /></div>
          <div className="field"><label htmlFor="caption">Caption</label><textarea id="caption" name="caption" maxLength={280} placeholder="6:12am. Did not want to. Did it anyway." /></div>
          <button className="btn btn-primary" type="submit">Post receipt →</button>
          <p className="micro">Max 10MB. JPG, PNG, or WebP. Challenge membership is checked server-side.</p>
        </form>
      </div>
    </main>
  );
}
