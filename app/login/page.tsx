"use client";

import { FormEvent, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setMessage("Demo mode: add Supabase keys in .env.local to enable magic-link sign in."); return; }
    setLoading(true);
    const supabase = createBrowserClient(url, key);
    const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: "signup_started", source: "auth", properties: { next } }),
    }).catch(() => undefined);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    setMessage(error ? error.message : "Magic link sent. Check your inbox.");
    setLoading(false);
  }

  return (
    <main className="app-wrap" style={{maxWidth:560}}>
      <div className="app-head"><div><span className="tag">PASSWORDLESS</span><h1>Get back in.</h1><p>We&apos;ll email you a secure sign-in link.</p></div></div>
      <div className="panel"><form className="form" onSubmit={submit}><div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required placeholder="you@example.com" /></div><button className="btn btn-primary" disabled={loading}>{loading ? "Sending…" : "Email me a sign-in link →"}</button>{message && <div className={message.startsWith("Magic") ? "success" : "error"}>{message}</div>}</form></div>
    </main>
  );
}
