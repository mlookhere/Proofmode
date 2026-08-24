import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { attributionCookieName, decodeAttribution } from "@/lib/attribution";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const requested = searchParams.get("next") || "/dashboard";
  const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const createdAt = Date.parse(user.created_at);
        const isNewAccount = Number.isFinite(createdAt) && Date.now() - createdAt <= 15 * 60 * 1000;
        if (isNewAccount) {
          const store = await cookies();
          const attribution = decodeAttribution(store.get(attributionCookieName)?.value);
          await supabase.from("analytics_events").insert({
            user_id: user.id,
            event_name: "signup_completed",
            source: attribution?.source || "auth",
            properties: {
              path: attribution?.path ?? next,
              invite_code: attribution?.inviteCode ?? null,
            },
          });
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`);
}
