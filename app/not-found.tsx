import Link from "next/link";

export default function NotFound() {
  return <main className="app-wrap" style={{maxWidth:720,textAlign:"center",paddingTop:90}}><span className="tag">NO RECEIPT</span><h1 style={{fontSize:72}}>Nothing to verify here.</h1><p className="section-lede" style={{margin:"0 auto 24px"}}>The page may be private, expired, or simply not exist.</p><Link className="btn btn-primary" href="/drops">Enter a live Drop →</Link></main>;
}
