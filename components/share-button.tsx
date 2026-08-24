"use client";

import { useState } from "react";
import { canonicalUrl } from "@/lib/sharing";

type Props = Readonly<{ title: string; text: string; path: string; source: string; className?: string }>;

async function event(eventName: "share_started" | "share_completed", source: string, path: string) {
  await fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventName, source, properties: { path } }),
  }).catch(() => undefined);
}

export function ShareButton({ title, text, path, source, className = "btn" }: Props) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  async function share() {
    setState("working");
    const url = canonicalUrl(path, source);
    try {
      await event("share_started", source, path);
      if (navigator.share) {
        try {
          await navigator.share({ title, text, url });
        } catch (cause) {
          if ((cause as Error)?.name === "AbortError") { setState("idle"); return; }
          throw cause;
        }
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
      }
      await event("share_completed", source, path);
      setState("done");
    } catch {
      setState("error");
    }
  }

  const label = state === "working" ? "Sharing…" : state === "done" ? "Shared ✓" : state === "error" ? "Share failed" : "Share ↗";
  return <button type="button" className={className} disabled={state === "working"} onClick={() => void share()}>{label}</button>;
}
