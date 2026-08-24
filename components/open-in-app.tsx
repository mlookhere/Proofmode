import { appUrl } from "@/lib/sharing";

export function OpenInApp({ path, source = "web_fallback", label = "Open in app →" }: { path: string; source?: string; label?: string }) {
  return <a className="btn btn-primary" href={appUrl(path, source)}>{label}</a>;
}
