"use client";

import { useEffect } from "react";

export function AttributionCapture({ source, inviteCode = null, path }: { source: string; inviteCode?: string | null; path: string }) {
  useEffect(() => {
    void fetch("/api/attribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, inviteCode, path }),
    });
  }, [inviteCode, path, source]);
  return null;
}
