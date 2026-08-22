import { colors } from "@/theme";
import { postKinds, type FeedPost, type PostKind } from "@/domain";
import { requireSupabase } from "@/lib/supabase";

type FeedRow = Readonly<{
  post_id: string;
  kind: string;
  caption: string | null;
  published_at: string;
  handle: string | null;
  display_name: string | null;
  challenge_id: string | null;
  challenge_title: string | null;
  proof_id: string | null;
  reaction_count: number | string;
  comment_count: number | string;
  score: number | string;
}>;

export type FeedCursor = Readonly<{
  score: number;
  publishedAt: string;
  postId: string;
}>;

export type FeedPage = Readonly<{
  items: readonly FeedPost[];
  nextCursor: FeedCursor | null;
}>;

const accentByKind: Record<PostKind, string> = {
  proof: colors.hot,
  fail: colors.danger,
  almost: colors.orange,
  comeback: colors.blue,
  pr: colors.hot,
  chaos: colors.orange,
  bts: colors.blue,
  reset: colors.blue,
};

function asPostKind(value: string): PostKind {
  return postKinds.includes(value as PostKind) ? (value as PostKind) : "proof";
}

function compactCount(value: number | string) {
  const count = Number(value) || 0;
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
}

function displayDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
}

function displayMark(kind: PostKind) {
  if (kind === "proof" || kind === "pr") return "✓";
  if (kind === "fail") return "×";
  if (kind === "comeback" || kind === "reset") return "↗";
  return "•";
}

function toFeedPost(row: FeedRow): FeedPost {
  const kind = asPostKind(row.kind);
  const handle = row.handle ? `@${row.handle}` : "";

  return {
    id: row.post_id,
    kind,
    day: displayDate(row.published_at),
    user: row.display_name?.trim() || row.handle || "PROVER",
    handle,
    challenge: row.challenge_title || "PROOFMODE",
    value: displayMark(kind),
    caption: row.caption?.trim() || "Proof posted.",
    accent: accentByKind[kind],
    reactions: compactCount(row.reaction_count),
    comments: compactCount(row.comment_count),
    action: row.challenge_id ? "VIEW CHALLENGE" : row.proof_id ? "VIEW PROOF" : "VIEW POST",
  };
}

export async function fetchFeedPage(cursor: FeedCursor | null = null, limit = 20): Promise<FeedPage> {
  const client = requireSupabase();
  const pageSize = Math.max(1, Math.min(limit, 49));
  const { data, error } = await client.rpc("get_feed_v1", {
    max_items: pageSize + 1,
    cursor_score: cursor?.score ?? null,
    cursor_time: cursor?.publishedAt ?? null,
    cursor_post_id: cursor?.postId ?? null,
  });

  if (error) throw error;

  const rows = (data ?? []) as FeedRow[];
  const pageRows = rows.slice(0, pageSize);
  const last = pageRows.at(-1);
  const nextScore = last ? Number(last.score) : Number.NaN;

  return {
    items: pageRows.map(toFeedPost),
    nextCursor:
      rows.length > pageSize && last && Number.isFinite(nextScore)
        ? { score: nextScore, publishedAt: last.published_at, postId: last.post_id }
        : null,
  };
}
