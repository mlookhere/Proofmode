"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function AttributionCapture({ source, inviteCode = null, path }: { source: string; inviteCode?: string | null; path: string }) {
  const searchParams = useSearchParams();
  const querySource = searchParams.get("src")?.trim().slice(0, 40) || null;
  const queryInvite = searchParams.get("ref")?.trim().slice(0, 64) || null;
  const resolvedSource = querySource || source;
  const resolvedInvite = queryInvite || inviteCode;

  useEffect(() => {
    void fetch("/api/attribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: resolvedSource, inviteCode: resolvedInvite, path }),
    });
  }, [path, resolvedInvite, resolvedSource]);
  return null;
}
