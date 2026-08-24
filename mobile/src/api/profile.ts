import { requireSupabase } from "@/lib/supabase";

export type Profile = Readonly<{
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan: "free" | "pro" | "creator" | "black";
}>;

export type PassportJourney = Readonly<{
  id: string;
  challenge_id: string;
  challenge_title: string;
  challenge_slug: string;
  attempt_no: number;
  status: "active" | "completed" | "paused" | "ended";
  started_at: string;
  ended_at: string | null;
  verified_count: number;
  current_streak: number;
  best_streak: number;
}>;

export type PassportPost = Readonly<{
  post_id: string;
  kind: string;
  caption: string | null;
  published_at: string;
  journey_id: string | null;
  challenge_title: string | null;
  challenge_slug: string | null;
}>;

export type ProfileSnapshot = Readonly<{
  receipts: number;
  verified_receipts: number;
  founder_badges: number;
  recruits: number;
  proof_score: number;
  completed_drops: number;
  current_streak: number;
  best_streak: number;
  comeback_count: number;
  active_journeys: readonly PassportJourney[];
  journeys: readonly PassportJourney[];
  trophy_case: readonly PassportJourney[];
  recent_posts: readonly PassportPost[];
}>;

export const emptyProfileSnapshot: ProfileSnapshot = {
  receipts: 0,
  verified_receipts: 0,
  founder_badges: 0,
  recruits: 0,
  proof_score: 0,
  completed_drops: 0,
  current_streak: 0,
  best_streak: 0,
  comeback_count: 0,
  active_journeys: [],
  journeys: [],
  trophy_case: [],
  recent_posts: [],
};

export async function fetchMyProfile(userId: string): Promise<Profile> {
  const client = requireSupabase();
  const { data, error } = await client
    .from("profiles")
    .select("id,handle,display_name,avatar_url,plan")
    .eq("id", userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function fetchProfileSnapshot(handle: string): Promise<ProfileSnapshot | null> {
  const client = requireSupabase();
  const { data, error } = await client.rpc("get_profile_snapshot", { target_handle: handle });

  if (error) throw error;
  return data as ProfileSnapshot | null;
}
