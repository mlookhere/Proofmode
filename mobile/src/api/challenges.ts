import { requireSupabase } from "@/lib/supabase";

export type PublicChallenge = Readonly<{
  id: string;
  title: string;
  slug: string;
  rule: string;
  durationDays: number;
  visibility: "public" | "crew" | "private";
  format: "drop" | "crew";
  category: string;
  tagline: string | null;
  seatCap: number | null;
  founderCutoff: number;
  coverEmoji: string | null;
}>;

export type ChallengeViewerState = Readonly<{
  joined: boolean;
  watched: boolean;
}>;

type ChallengeRow = {
  id: string;
  title: string;
  slug: string;
  rule: string;
  duration_days: number;
  visibility: "public" | "crew" | "private";
  format: "drop" | "crew";
  category: string;
  tagline: string | null;
  seat_cap: number | null;
  founder_cutoff: number;
  cover_emoji: string | null;
};

const challengeFields = "id,title,slug,rule,duration_days,visibility,format,category,tagline,seat_cap,founder_cutoff,cover_emoji";

function mapChallenge(row: ChallengeRow): PublicChallenge {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    rule: row.rule,
    durationDays: row.duration_days,
    visibility: row.visibility,
    format: row.format,
    category: row.category,
    tagline: row.tagline,
    seatCap: row.seat_cap,
    founderCutoff: row.founder_cutoff,
    coverEmoji: row.cover_emoji,
  };
}

export async function fetchPublicChallenges(limit = 24): Promise<readonly PublicChallenge[]> {
  const pageSize = Math.max(1, Math.min(limit, 50));
  const { data, error } = await requireSupabase()
    .from("challenges")
    .select(challengeFields)
    .eq("visibility", "public")
    .eq("format", "drop")
    .order("created_at", { ascending: false })
    .limit(pageSize);

  if (error) throw error;
  return ((data ?? []) as ChallengeRow[]).map(mapChallenge);
}

export async function fetchChallengeBySlug(slug: string): Promise<PublicChallenge | null> {
  const { data, error } = await requireSupabase().rpc("get_challenge_landing", {
    target_slug: slug,
    target_invite_code: null,
  });
  if (error) throw error;
  return data ? mapChallenge(data as ChallengeRow) : null;
}

export async function fetchChallengeViewerState(
  challengeId: string,
  userId: string,
): Promise<ChallengeViewerState> {
  const client = requireSupabase();
  const [membership, watch] = await Promise.all([
    client
      .from("challenge_members")
      .select("challenge_id")
      .eq("challenge_id", challengeId)
      .eq("user_id", userId)
      .maybeSingle(),
    client
      .from("watched_challenges")
      .select("challenge_id")
      .eq("challenge_id", challengeId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (membership.error) throw membership.error;
  if (watch.error) throw watch.error;

  return { joined: Boolean(membership.data), watched: Boolean(watch.data) };
}

export async function joinChallenge(slug: string, inviteCode: string | null = null) {
  const { data, error } = await requireSupabase().rpc("join_challenge_v2", {
    target_slug: slug,
    target_invite_code: inviteCode,
  });
  if (error) throw error;
  return data as string;
}

export async function setChallengeWatched(challengeId: string, userId: string, watched: boolean) {
  const client = requireSupabase();

  if (watched) {
    const { error } = await client
      .from("watched_challenges")
      .upsert({ user_id: userId, challenge_id: challengeId }, {
        onConflict: "user_id,challenge_id",
        ignoreDuplicates: true,
      });
    if (error) throw error;
    return;
  }

  const { error } = await client
    .from("watched_challenges")
    .delete()
    .eq("user_id", userId)
    .eq("challenge_id", challengeId);
  if (error) throw error;
}
