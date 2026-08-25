"use client";

import { useState } from "react";
import { canonicalUrl } from "@/lib/sharing";

async function track(eventName: "receipt_shared" | "share_started" | "share_completed", proofId: string, slug: string) {
  await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, source: "receipt_share", properties: { proof_id: proofId, challenge_slug: slug, path: `/r/${proofId}` } }),
  }).catch(() => undefined);
}

export function ShareReceiptButton({ proofId, slug, challengeTitle }: { proofId: string; slug: string; challengeTitle: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function share() {
    setState("working");
    const receiptUrl = canonicalUrl(`/r/${proofId}`, "receipt_share");
    const text = `${challengeTitle}: receipt posted. Beat my streak on ProofMode.`;
    try {
      await track("share_started", proofId, slug);
      await track("receipt_shared", proofId, slug);
      if (navigator.share) {
        try {
          const imageResponse = await fetch(`/api/share/${proofId}?format=story`);
          if (!imageResponse.ok) throw new Error("Receipt image unavailable");
          const blob = await imageResponse.blob();
          const file = new File([blob], "proofmode-receipt.svg", { type: "image/svg+xml" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title: challengeTitle, text, url: receiptUrl, files: [file] });
          } else {
            await navigator.share({ title: challengeTitle, text, url: receiptUrl });
          }
        } catch (error) {
          if ((error as Error)?.name === "AbortError") { setState("idle"); return; }
          throw error;
        }
      } else {
        await navigator.clipboard.writeText(`${text} ${receiptUrl}`);
      }
      await track("share_completed", proofId, slug);
      setState("done");
    } catch {
      setState("error");
    }
  }

  return <button className="btn" type="button" onClick={share} disabled={state === "working"}>{state === "working" ? "Packing receipt…" : state === "done" ? "Shared ✓" : state === "error" ? "Share failed" : "Share receipt ↗"}</button>;
}
