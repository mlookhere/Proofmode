import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttributionCapture } from "@/components/attribution-capture";
import { OpenInApp } from "@/components/open-in-app";
import { ShareButton } from "@/components/share-button";
import { canonicalUrl } from "@/lib/sharing";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type Receipt = { id:string; handle:string|null; display_name:string|null; challenge_slug:string; challenge_title:string; challenge_rule:string; proof_date:string; caption:string|null; post_id:string|null; journey_id:string|null; verified_count:number };
async function load(id:string){ if(!hasSupabaseEnv()) return null; const {data}=await (await createClient()).rpc("get_public_receipt_share_v1",{target_receipt:id}); return data as Receipt|null; }

export async function generateMetadata({params}:{params:Promise<{receiptId:string}>}):Promise<Metadata>{ const {receiptId}=await params; const r=await load(receiptId); if(!r)return{title:"Receipt not available"}; const title=`${r.challenge_title} · Receipt`; const description=r.caption||`${r.display_name||r.handle||"A ProofMode member"} posted the receipt.`; const path=`/r/${receiptId}`; return{title,description,alternates:{canonical:path},openGraph:{title,description,url:canonicalUrl(path),type:"article",images:[`/api/share/${receiptId}?format=square`]},twitter:{card:"summary_large_image",title,description,images:[`/api/share/${receiptId}?format=square`]}}; }

export default async function ReceiptPage({params,searchParams}:{params:Promise<{receiptId:string}>;searchParams:Promise<{src?:string}>}){ const {receiptId}=await params; const {src}=await searchParams; const r=await load(receiptId); if(!r)notFound(); const path=`/r/${receiptId}`; return <main className="app-wrap wide-wrap"><AttributionCapture source={src?.slice(0,40)||"receipt_link"} path={path}/><section className="section"><span className="tag">RECEIPT · VERIFIED × {r.verified_count}</span><h1>{r.challenge_title}</h1><div className="receipt-grid"><article className="proof-card receipt-tile"><img src={`/api/share/${receiptId}?format=portrait`} alt="ProofMode Receipt"/><div className="proof-body"><strong>{r.handle?`@${r.handle}`:r.display_name||"ProofMode member"}</strong><p>{r.caption||r.challenge_rule}</p><span className="muted">{r.proof_date}</span></div></article></div><div className="actions"><OpenInApp path={path}/><ShareButton title={`${r.challenge_title} Receipt`} text="No receipt. No streak. Beat me on ProofMode." path={path} source="receipt_share"/><Link className="btn" href={`/c/${r.challenge_slug}`}>Join this Drop →</Link>{r.post_id&&<Link className="btn" href={`/p/${r.post_id}`}>View post →</Link>}{r.journey_id&&<Link className="btn" href={`/j/${r.journey_id}`}>Follow Journey →</Link>}</div></section></main>; }
