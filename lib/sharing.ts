export const canonicalOrigin = (process.env.NEXT_PUBLIC_APP_URL || "https://proofmode.app").replace(/\/$/, "");

export function withShareSource(path: string, source?: string | null) {
  if (!source) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}src=${encodeURIComponent(source.slice(0, 40))}`;
}

export function canonicalUrl(path: string, source?: string | null) {
  return `${canonicalOrigin}${withShareSource(path.startsWith("/") ? path : `/${path}`, source)}`;
}

export function appUrl(path: string, source?: string | null) {
  const clean = withShareSource(path.startsWith("/") ? path.slice(1) : path, source);
  return `proofmode://${clean}`;
}
