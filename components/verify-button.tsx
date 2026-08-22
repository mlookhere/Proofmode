"use client";

import { useState } from "react";

export function VerifyButton({ proofId }: { proofId: string }) {
  const [state, setState] = useState<"idle"|"loading"|"verified"|"error">("idle");
  async function verify() {
    setState("loading");
    const res = await fetch("/api/verifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proofId, verdict: true }) });
    setState(res.ok ? "verified" : "error");
  }
  return <button className={state === "verified" ? "btn btn-primary" : "btn"} onClick={verify} disabled={state === "loading" || state === "verified"}>{state === "verified" ? "✓ Verified" : state === "loading" ? "Checking…" : state === "error" ? "Sign in to verify" : "Verify receipt"}</button>;
}
