import { NextResponse } from "next/server";

const components = ["/p/*", "/r/*", "/c/*", "/j/*", "/u/*", "/invite/*"].map((path) => ({
  "/": path,
  comment: "ProofMode canonical content link",
}));

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim().toUpperCase() || "";
  if (!/^[A-Z0-9]{10}$/.test(teamId)) {
    return NextResponse.json(
      { error: "Apple Universal Link association is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: [{ appIDs: [`${teamId}.com.proofmode.app`], components }],
      },
    },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" } },
  );
}
