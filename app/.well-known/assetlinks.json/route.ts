import { NextResponse } from "next/server";

export function GET() {
  const fingerprints = (process.env.ANDROID_APP_CERT_SHA256 || "").split(",").map((value) => value.trim()).filter(Boolean);
  const body = fingerprints.length ? [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: "com.proofmode.app",
      sha256_cert_fingerprints: fingerprints,
    },
  }] : [];
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": fingerprints.length ? "public, max-age=3600, s-maxage=3600" : "no-store",
      "Content-Type": "application/json",
    },
  });
}
