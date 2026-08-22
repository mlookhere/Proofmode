import { requireSupabase } from "@/lib/supabase";

export type Profile = Readonly<{
  id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  plan: "free" | "pro" | "creator";
}>;

export type ProfileSnapshot = Readonly<{
  receipts: number;
  verified_receipts: number;
  founder_badges: number;
  recruits: number;
  proof_score: number;
}>;

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
