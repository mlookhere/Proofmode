"use client";

import { useSearchParams } from "next/navigation";
import { appUrl } from "@/lib/sharing";

export function OpenInApp({ path, source = "web_fallback", label = "Open in app →" }: { path: string; source?: string; label?: string }) {
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("ref")?.trim().slice(0, 64) || null;
  const querySource = searchParams.get("src")?.trim().slice(0, 40) || source;
  const separator = path.includes("?") ? "&" : "?";
  const targetPath = inviteCode ? `${path}${separator}ref=${encodeURIComponent(inviteCode)}` : path;
  return <a className="btn btn-primary" href={appUrl(targetPath, querySource)}>{label}</a>;
}
