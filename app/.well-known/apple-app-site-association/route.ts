import { NextResponse } from "next/server";

const components = ["/p/*","/r/*","/c/*","/j/*","/u/*","/invite/*"].map((path) => ({ "/": path, comment: "ProofMode canonical content link" }));

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  const appId = teamId ? `${teamId}.com.proofmode.app` : null;
  return NextResponse.json({
    applinks: {
      apps: [],
      details: appId ? [{ appIDs: [appId], components }] : [],
    },
  }, {
    headers: {
      "Cache-Control": appId ? "public, max-age=3600, s-maxage=3600" : "no-store",
      "Content-Type": "application/json",
    },
  });
}
