import { NextResponse } from "next/server";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

const RESTRICTED = /(?:starve|no food|purge|self[- ]?harm|suicide|overdose|water fast|dry fast|lose \d+ ?(?:lb|lbs|kg) in \d+ days)/i;
const CATEGORIES = new Set(["fitness","build","work","creative","mind","social","other"]);

function slugify(input: string) {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 54);
}

export async function POST(request: Request) {
  const form = await request.formData();
  const title = String(form.get("title") || "").trim();
  const rule = String(form.get("rule") || "").trim();
  const tagline = String(form.get("tagline") || "").trim().slice(0, 120) || null;
  const duration = Number(form.get("duration") || 30);
  const visibility = String(form.get("visibility") || "crew");
  const format = String(form.get("format") || "crew") === "drop" ? "drop" : "crew";
  const categoryRaw = String(form.get("category") || "other");
  const category = CATEGORIES.has(categoryRaw) ? categoryRaw : "other";
  const requestedSeatCap = Number(form.get("seatCap") || 0);
  const founderCutoff = Math.max(1, Math.min(100, Number(form.get("founderCutoff") || 5)));
  const coverEmoji = String(form.get("coverEmoji") || "↗").trim().slice(0, 8) || "↗";

  if (!title || !rule || ![7,14,30,60,100].includes(duration)) return NextResponse.json({ error: "Invalid challenge" }, { status: 400 });
  if (!["crew","public","private"].includes(visibility)) return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  if (RESTRICTED.test(`${title} ${rule}`)) return NextResponse.json({ error: "This challenge needs a safer goal. Avoid dangerous deprivation, self-harm, or extreme rapid-weight-loss targets." }, { status: 400 });
  const slug = `${slugify(title) || "challenge"}-${Math.random().toString(36).slice(2,7)}`;

  if (hasSupabaseEnv()) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent("/onboarding")}`, request.url), 303);
    const profile = await supabase.from("profiles").select("plan").eq("id", user.id).single();
    const plan = profile.data?.plan || "free";
    if (plan === "free") {
      const existing = await supabase.from("challenges").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
      if ((existing.count || 0) >= 1) return NextResponse.redirect(new URL("/pricing?reason=challenge_limit", request.url), 303);
      if (visibility === "private") return NextResponse.redirect(new URL("/pricing?reason=private_crew", request.url), 303);
    }

    const planCap = plan === "creator" ? 100000 : plan === "pro" ? 25 : 5;
    const seatCap = format === "drop" ? Math.min(requestedSeatCap > 0 ? requestedSeatCap : planCap, planCap) : null;
    const insert = {
      owner_id: user.id, title, slug, rule, duration_days: duration, visibility,
      format, category, tagline, seat_cap: seatCap, founder_cutoff: Math.min(founderCutoff, seatCap || founderCutoff), cover_emoji: coverEmoji
    };
    const { error } = await supabase.from("challenges").insert(insert);
    if (error) return NextResponse.json({ error: `${error.message}. If this is a new install, run supabase/migrations/002_growth_engine.sql.` }, { status: 500 });
    await supabase.from("analytics_events").insert({ user_id: user.id, event_name: format === "drop" ? "drop_launched" : "challenge_started", source: "onboarding", properties: { duration_days: duration, visibility, plan, category, seat_cap: seatCap } });
  }
  return NextResponse.redirect(new URL(`/c/${slug}?launched=1`, request.url), 303);
}
