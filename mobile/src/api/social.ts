import { requireSupabase } from "@/lib/supabase";

export const reactionKinds = ["proven", "respect", "lol", "run_it_back", "im_next"] as const;
export type ReactionKind = (typeof reactionKinds)[number];

export const reportReasons = ["spam", "harassment", "hate", "dangerous", "sexual", "self_harm", "illegal", "impersonation", "other"] as const;
export type ReportReason = (typeof reportReasons)[number];
export type ReportTargetType = "post" | "comment" | "user" | "challenge";

export type PostComment = Readonly<{
  id: string;
  userId: string;
  displayName: string;
  handle: string | null;
  body: string;
  createdAt: string;
  isOwn: boolean;
}>;

export type CrewSummary = Readonly<{
  id: string;
  title: string;
  slug: string;
  coverEmoji: string | null;
  memberCount: number;
  lastActivityAt: string;
}>;

export type CrewMember = Readonly<{
  user_id: string;
  display_name: string;
  handle: string | null;
  role: string;
  founder: boolean;
  receipts: number;
  verified_receipts: number;
  proof_score: number;
  rank: number;
}>;

export type CrewActivity = Readonly<{
  post_id: string;
  kind: string;
  caption: string | null;
  published_at: string | null;
  user_id: string;
  display_name: string;
  handle: string | null;
}>;

export type CrewMessage = Readonly<{
  message_id: string;
  user_id: string;
  display_name: string;
  handle: string | null;
  body: string;
  created_at: string;
  is_own: boolean;
}>;

export type CrewRoom = Readonly<{
  id: string;
  title: string;
  slug: string;
  rule: string;
  cover_emoji: string | null;
  owner_id: string;
  member_count: number;
  members: readonly CrewMember[];
  leaderboard: readonly CrewMember[];
  recent_activity: readonly CrewActivity[];
  messages: readonly CrewMessage[];
}>;

export type BlockedUser = Readonly<{
  id: string;
  displayName: string;
  handle: string | null;
  blockedAt: string;
}>;

type CommentRow = {
  comment_id: string;
  user_id: string;
  display_name: string;
  handle: string | null;
  body: string;
  created_at: string;
  is_own: boolean;
};

type CrewSummaryRow = {
  crew_id: string;
  title: string;
  slug: string;
  cover_emoji: string | null;
  member_count: number | string;
  last_activity_at: string;
};

type BlockedUserRow = {
  user_id: string;
  display_name: string;
  handle: string | null;
  blocked_at: string;
};

export async function setFollow(userId: string, follow: boolean) {
  const { data, error } = await requireSupabase().rpc("set_follow_v1", { target_user: userId, should_follow: follow });
  if (error) throw error;
  return Boolean(data);
}

export async function setPostReaction(postId: string, reaction: ReactionKind | null) {
  const { data, error } = await requireSupabase().rpc("set_post_reaction_v1", { target_post: postId, target_reaction: reaction });
  if (error) throw error;
  return (data ?? null) as ReactionKind | null;
}

export async function fetchPostComments(postId: string, limit = 50): Promise<readonly PostComment[]> {
  const { data, error } = await requireSupabase().rpc("get_post_comments_v1", {
    target_post: postId,
    max_items: Math.max(1, Math.min(limit, 100)),
  });
  if (error) throw error;
  return ((data ?? []) as CommentRow[]).map((row) => ({
    id: row.comment_id,
    userId: row.user_id,
    displayName: row.display_name,
    handle: row.handle,
    body: row.body,
    createdAt: row.created_at,
    isOwn: row.is_own,
  }));
}

export async function createComment(postId: string, body: string) {
  const { data, error } = await requireSupabase().rpc("create_comment_v1", { target_post: postId, target_body: body });
  if (error) throw error;
  return data as string;
}

export async function deleteComment(commentId: string) {
  const { data, error } = await requireSupabase().rpc("delete_comment_v1", { target_comment: commentId });
  if (error) throw error;
  return Boolean(data);
}

export async function setBlock(userId: string, block: boolean) {
  const { data, error } = await requireSupabase().rpc("set_block_v1", { target_user: userId, should_block: block });
  if (error) throw error;
  return Boolean(data);
}

export async function submitReport(targetType: ReportTargetType, targetId: string, reason: ReportReason) {
  const { data, error } = await requireSupabase().rpc("submit_report_v1", {
    target_type: targetType,
    target_id: targetId,
    target_reason: reason,
    target_details: null,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchMyCrews(): Promise<readonly CrewSummary[]> {
  const { data, error } = await requireSupabase().rpc("get_my_crews_v1");
  if (error) throw error;
  return ((data ?? []) as CrewSummaryRow[]).map((row) => ({
    id: row.crew_id,
    title: row.title,
    slug: row.slug,
    coverEmoji: row.cover_emoji,
    memberCount: Number(row.member_count) || 0,
    lastActivityAt: row.last_activity_at,
  }));
}

export async function fetchCrewRoom(crewId: string): Promise<CrewRoom> {
  const { data, error } = await requireSupabase().rpc("get_crew_room_v1", { target_crew: crewId });
  if (error) throw error;
  if (!data) throw new Error("Crew not found.");
  return data as CrewRoom;
}

export async function postCrewMessage(crewId: string, body: string) {
  const { data, error } = await requireSupabase().rpc("post_crew_message_v1", { target_crew: crewId, target_body: body });
  if (error) throw error;
  return data as string;
}

export async function deleteCrewMessage(messageId: string) {
  const { data, error } = await requireSupabase().rpc("delete_crew_message_v1", { target_message: messageId });
  if (error) throw error;
  return Boolean(data);
}

export async function createCrewInvite(crewId: string) {
  const { data, error } = await requireSupabase().rpc("create_crew_invite_v1", { target_crew: crewId });
  if (error) throw error;
  return data as string;
}

export async function fetchMyBlocks(): Promise<readonly BlockedUser[]> {
  const { data, error } = await requireSupabase().rpc("get_my_blocks_v1");
  if (error) throw error;
  return ((data ?? []) as BlockedUserRow[]).map((row) => ({
    id: row.user_id,
    displayName: row.display_name,
    handle: row.handle,
    blockedAt: row.blocked_at,
  }));
}
