import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttributionCapture } from "@/components/attribution-capture";
import { OpenInApp } from "@/components/open-in-app";
import { ShareButton } from "@/components/share-button";
import { canonicalUrl } from "@/lib/sharing";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

type PostShare = { id:string; kind:string; caption:string|null; published_at:string; handle:string|null; display_name:string|null; challenge_slug:string|null; challenge_title:string|null; journey_id:string|null; proof_id:string|null; media_kind:"image"|"video"|null; media_public_url:string|null };

async function load(postId: string) {
  if (!hasSupabaseEnv()) return null;
  const { data } = await (await createClient()).rpc("get_public_post_share_v1", { target_post: postId });
  return data as PostShare | null;
}

export async function generateMetadata({ params }: { params: Promise<{ postId:string }> }): Promise<Metadata> {
  const { postId } = await params;
  const post = await load(postId);
  if (!post) return { title: "Post not available" };
  const title = `${post.display_name || post.handle || "ProofMode member"} · ${post.kind.toUpperCase()}`;
  const description = post.caption || `A ${post.kind} on ProofMode.`;
  const path = `/p/${postId}`;
  return { title, description, alternates:{ canonical:path }, openGraph:{ title, description, url:canonicalUrl(path), type:"article", images:post.media_kind==="image"&&post.media_public_url?[post.media_public_url]:undefined }, twitter:{ card:"summary_large_image", title, description } };
}

export default async function PublicPostPage({ params, searchParams }: { params:Promise<{postId:string}>; searchParams:Promise<{src?:string}> }) {
  const { postId } = await params;
  const { src } = await searchParams;
  const post = await load(postId);
  if (!post) notFound();
  const path = `/p/${postId}`;
  const source = src?.slice(0,40) || "post_link";
  return <main className="app-wrap wide-wrap">
    <AttributionCapture source={source} path={path}/>
    <section className="section"><span className="tag">{post.kind.toUpperCase()}</span><h1>{post.challenge_title || "PROOFMODE"}</h1><p className="section-lede">{post.caption || "Proof posted."}</p>
      {post.media_kind==="image"&&post.media_public_url&&<img className="proof-preview" src={post.media_public_url} alt="Public ProofMode post"/>}
      {post.media_kind==="video"&&post.media_public_url&&<video className="proof-preview" src={post.media_public_url} controls playsInline/>}
      <p className="muted">By {post.handle?`@${post.handle}`:post.display_name||"ProofMode member"} · {new Date(post.published_at).toLocaleDateString()}</p>
      <div className="actions"><OpenInApp path={path}/><ShareButton title={post.challenge_title||"ProofMode"} text={post.caption||"See what happened on ProofMode."} path={path} source="post_share"/>{post.challenge_slug&&<Link className="btn" href={`/c/${post.challenge_slug}`}>Try this Drop →</Link>}{post.journey_id&&<Link className="btn" href={`/j/${post.journey_id}`}>Follow Journey →</Link>}{post.proof_id&&<Link className="btn" href={`/r/${post.proof_id}`}>View Receipt →</Link>}</div>
    </section>
  </main>;
}
