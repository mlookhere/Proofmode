import { NextResponse } from "next/server";
import { attributionCookieName, encodeAttribution, normalizeAttribution } from "@/lib/attribution";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const context = normalizeAttribution(await request.json().catch(() => ({})));
  if (!context) return NextResponse.json({ error: "Invalid attribution" }, { status: 400 });
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(attributionCookieName, encodeAttribution(context), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("analytics_events").insert({
      user_id: user?.id || null,
      event_name: "landing_view",
      source: context.source,
      properties: { path: context.path, invite_code: context.inviteCode },
    });
  }
  return response;
}
