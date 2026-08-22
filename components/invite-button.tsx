"use client";

import { useState } from "react";

type Props = {
  challengeId: string;
  slug: string;
  title: string;
  label?: string;
};

export function InviteButton({ challengeId, slug, title, label = "Call out a friend ↗" }: Props) {
  const [state, setState] = useState<"idle" | "working" | "shared" | "copied" | "error">("idle");

  async function shareInvite() {
    setState("working");
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId })
      });
      if (!response.ok) throw new Error("invite failed");
      const data = (await response.json()) as { code: string };
      const url = `${window.location.origin}/c/${slug}?ref=${encodeURIComponent(data.code)}`;
      const text = `I’m doing ${title} on ProofMode. No streaks without receipts. Beat me.`;

      if (navigator.share) {
        await navigator.share({ title, text, url });
        setState("shared");
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setState("copied");
      }
    } catch {
      setState("error");
    }
  }

  const copy = state === "working" ? "Building invite…" : state === "shared" ? "Sent. Game on. ✓" : state === "copied" ? "Invite copied ✓" : state === "error" ? "Sign in to invite" : label;
  return <button className="btn btn-primary" type="button" onClick={shareInvite} disabled={state === "working"}>{copy}</button>;
}
