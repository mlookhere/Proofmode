import { requireSupabase } from "@/lib/supabase";

export type PublicPostShare = Readonly<{
  id: string;
  kind: string;
  caption: string | null;
  published_at: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  challenge_id: string | null;
  challenge_slug: string | null;
  challenge_title: string | null;
  journey_id: string | null;
  proof_id: string | null;
  media_kind: "image" | "video" | null;
  media_public_url: string | null;
}>;

export type PublicReceiptShare = Readonly<{
  id: string;
  user_id: string;
  handle: string | null;
  display_name: string | null;
  avatar_url: string | null;
  challenge_id: string;
  challenge_slug: string;
  challenge_title: string;
  challenge_rule: string;
  challenge_created_at: string;
  proof_date: string;
  caption: string | null;
  post_id: string | null;
  journey_id: string | null;
  media_kind: "image" | "video" | null;
  media_public_url: string | null;
  verified_count: number;
}>;

export type InviteShare = Readonly<{
  code: string;
  challenge_id: string;
  challenge_slug: string;
  challenge_title: string;
  challenge_rule: string;
  challenge_tagline: string | null;
  challenge_duration_days: number;
  challenge_visibility: string;
  challenge_format: string;
  cover_emoji: string | null;
  inviter_id: string;
  inviter_handle: string | null;
  inviter_display_name: string | null;
}>;

export async function fetchPublicPostShare(postId: string): Promise<PublicPostShare | null> {
  const { data, error } = await requireSupabase().rpc("get_public_post_share_v1", { target_post: postId });
  if (error) throw error;
  return data as PublicPostShare | null;
}

export async function fetchPublicReceiptShare(receiptId: string): Promise<PublicReceiptShare | null> {
  const { data, error } = await requireSupabase().rpc("get_public_receipt_share_v1", { target_receipt: receiptId });
  if (error) throw error;
  return data as PublicReceiptShare | null;
}

export async function resolveInviteShare(code: string): Promise<InviteShare | null> {
  const { data, error } = await requireSupabase().rpc("resolve_invite_share_v1", { target_code: code });
  if (error) throw error;
  return data as InviteShare | null;
}
