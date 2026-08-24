import { requireSupabase } from "@/lib/supabase";

export type JourneyTimelineItem = Readonly<{
  post_id: string;
  kind: string;
  caption: string | null;
  published_at: string;
  proof_id: string | null;
  media_kind: "image" | "video" | null;
  media_public_url: string | null;
  media_playback_id: string | null;
  proof_verified: boolean;
  viewer_verdict: boolean | null;
  viewer_can_verify: boolean;
}>;

export type JourneySnapshot = Readonly<{
  id: string;
  user_id: string;
  display_name: string;
  handle: string | null;
  avatar_url: string | null;
  challenge_id: string;
  challenge_slug: string;
  challenge_title: string;
  attempt_no: number;
  status: "active" | "completed" | "paused" | "ended";
  started_at: string;
  ended_at: string | null;
  verified_count: number;
  current_streak: number;
  best_streak: number;
  viewer_following: boolean;
  viewer_is_owner: boolean;
  viewer_is_member: boolean;
  timeline: readonly JourneyTimelineItem[];
}>;

export async function fetchJourneySnapshot(journeyId: string): Promise<JourneySnapshot | null> {
  const { data, error } = await requireSupabase().rpc("get_journey_snapshot_v1", { target_journey: journeyId });
  if (error) throw error;
  return data as JourneySnapshot | null;
}

export async function fetchMyJourneyForDrop(challengeId: string): Promise<JourneySnapshot | null> {
  const { data, error } = await requireSupabase().rpc("get_my_journey_for_drop_v1", { target_challenge: challengeId });
  if (error) throw error;
  return data as JourneySnapshot | null;
}

export async function ensureJourney(challengeId: string) {
  const { data, error } = await requireSupabase().rpc("ensure_journey_v1", { target_challenge: challengeId });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Could not start Journey.");
  return data;
}

export async function resetJourney(challengeId: string, requestToken: string) {
  const { data, error } = await requireSupabase().rpc("reset_journey_v1", {
    target_challenge: challengeId,
    request_token: requestToken,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Could not reset Journey.");
  return data;
}

export async function setJourneyFollow(journeyId: string, shouldFollow: boolean) {
  const { data, error } = await requireSupabase().rpc("set_journey_follow_v1", {
    target_journey: journeyId,
    should_follow: shouldFollow,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function setProofVerification(proofId: string, verdict: boolean) {
  const { data, error } = await requireSupabase().rpc("set_proof_verification_v1", {
    target_proof: proofId,
    target_verdict: verdict,
  });
  if (error) throw error;
  return Boolean(data);
}
