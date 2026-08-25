import { NextResponse } from "next/server";

function normalizeFingerprint(value: string) {
  const hex = value.replaceAll(":", "").trim().toUpperCase();
  if (!/^[A-F0-9]{64}$/.test(hex)) return null;
  return hex.match(/.{2}/g)?.join(":") || null;
}

export function GET() {
  const configured = (process.env.ANDROID_APP_CERT_SHA256 || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const fingerprints = configured.map(normalizeFingerprint);

  if (configured.length === 0 || fingerprints.some((value) => !value)) {
    return NextResponse.json(
      { error: "Android App Link association is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    [
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.proofmode.app",
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
