export const attributionCookieName = "proofmode_attr";

export type AttributionContext = Readonly<{
  source: string;
  inviteCode: string | null;
  path: string;
  capturedAt: string;
}>;

function safeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeAttribution(input: { source?: unknown; inviteCode?: unknown; path?: unknown }): AttributionContext | null {
  const source = safeText(input.source, 40) || "canonical_link";
  const inviteCode = safeText(input.inviteCode, 64) || null;
  const candidatePath = safeText(input.path, 500);
  const path = candidatePath.startsWith("/") && !candidatePath.startsWith("//") ? candidatePath : "/";
  if (!source && !inviteCode) return null;
  return { source, inviteCode, path, capturedAt: new Date().toISOString() };
}

export function encodeAttribution(value: AttributionContext) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeAttribution(value: string | undefined): AttributionContext | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as AttributionContext;
    return normalizeAttribution(parsed);
  } catch {
    return null;
  }
}
