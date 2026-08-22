"use client";

import { useState } from "react";

export function ShareReceiptButton({ proofId, slug, challengeTitle }: { proofId: string; slug: string; challengeTitle: string }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function share() {
    setState("working");
    try {
      const challengeUrl = `${window.location.origin}/c/${slug}`;
      const text = `${challengeTitle}: receipt posted. Beat my streak on ProofMode.`;
      await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventName: "receipt_shared", source: "receipt_button", properties: { proof_id: proofId, challenge_slug: slug } }) });

      if (navigator.share) {
        try {
          const imageResponse = await fetch(`/api/share/${proofId}`);
          const blob = await imageResponse.blob();
          const file = new File([blob], "proofmode-receipt.svg", { type: "image/svg+xml" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title: challengeTitle, text, url: challengeUrl, files: [file] });
          } else {
            await navigator.share({ title: challengeTitle, text, url: challengeUrl });
          }
        } catch (error) {
          if ((error as Error)?.name !== "AbortError") throw error;
        }
      } else {
        await navigator.clipboard.writeText(`${text} ${challengeUrl}`);
      }
      setState("done");
    } catch {
      setState("error");
    }
  }

  return <button className="btn" type="button" onClick={share} disabled={state === "working"}>{state === "working" ? "Packing receipt…" : state === "done" ? "Shared ✓" : state === "error" ? "Copy failed" : "Share receipt ↗"}</button>;
}
