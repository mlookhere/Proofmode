import { useEffect, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { setFollow, type ReactionKind } from "@/api/social";
import { useAuth } from "@/auth/session";
import { PostSocialModal } from "@/components/post-social-modal";
import type { FeedPost } from "@/domain";
import { isSupabaseConfigured } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme";

function compactCount(count: number) {
  if (count < 1_000) return String(count);
  if (count < 1_000_000) return `${(count / 1_000).toFixed(count >= 10_000 ? 0 : 1)}K`;
  return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
}

function reactionLabel(reaction: ReactionKind | null) {
  if (!reaction) return "REACT";
  return reaction.replaceAll("_", " ").toUpperCase();
}

function FeedVideo({ uri, active }: { uri: string; active: boolean }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = true;
  });

  useEffect(() => {
    if (active) player.play();
    else player.pause();
  }, [active, player]);

  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} surfaceType="textureView" />;
}

type FeedCardProps = {
  item: FeedPost;
  height: number;
  active?: boolean;
  onBlocked?: (userId: string) => void;
};

export function FeedCard({ item, height, active = false, onBlocked }: FeedCardProps) {
  const router = useRouter();
  const { session } = useAuth();
  const [socialOpen, setSocialOpen] = useState(false);
  const [following, setFollowing] = useState(item.viewerFollows);
  const [reaction, setReaction] = useState<ReactionKind | null>(item.viewerReaction);
  const [reactionCount, setReactionCount] = useState(item.reactions);
  const [commentCount, setCommentCount] = useState(item.comments);
  const [followBusy, setFollowBusy] = useState(false);
  const isOwnPost = session?.user.id === item.userId;

  useEffect(() => {
    setFollowing(item.viewerFollows);
    setReaction(item.viewerReaction);
    setReactionCount(item.reactions);
    setCommentCount(item.comments);
  }, [item.comments, item.id, item.reactions, item.viewerFollows, item.viewerReaction]);

  async function toggleFollow() {
    if (!isSupabaseConfigured || isOwnPost || followBusy) return;
    if (!session) {
      router.push("/auth");
      return;
    }

    setFollowBusy(true);
    try {
      setFollowing(await setFollow(item.userId, !following));
    } catch {
      Alert.alert("Could not update follow", "Try again in a moment.");
    } finally {
      setFollowBusy(false);
    }
  }

  function openSocial() {
    if (isSupabaseConfigured) setSocialOpen(true);
  }

  function openChallenge() {
    if (item.challengeSlug) router.push(`/challenge/${item.challengeSlug}`);
  }

  return (
    <>
      <View style={[styles.card, { height }]}>
        <View style={[styles.visual, { borderColor: item.accent }]}>
          {item.media?.kind === "image" && <Image source={{ uri: item.media.url }} resizeMode="cover" style={StyleSheet.absoluteFill} />}
          {item.media?.kind === "video" && <FeedVideo uri={item.media.url} active={active} />}
          {item.media && <View pointerEvents="none" style={styles.scrim} />}
          <View style={styles.top}>
            <Text style={[styles.kind, { color: item.accent, borderColor: item.accent }]}>{item.kind.toUpperCase()}</Text>
            <Text style={styles.day}>{item.day}</Text>
          </View>
          {!item.media && <Text style={styles.value}>{item.value}</Text>}
          <Text style={styles.challenge}>{item.challenge}</Text>
        </View>
        <View style={styles.copy}>
          <View style={styles.userRow}>
            <Text style={styles.user} numberOfLines={1}>
              {item.user} <Text style={styles.handle}>{item.handle}</Text>
            </Text>
            {isSupabaseConfigured && !isOwnPost ? (
              <Pressable accessibilityRole="button" disabled={followBusy} onPress={() => void toggleFollow()}>
                <Text style={[styles.follow, following && styles.following]}>{following ? "FOLLOWING" : "FOLLOW"}</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.caption}>{item.caption}</Text>
          <View style={styles.reactions}>
            <Pressable accessibilityRole="button" onPress={openSocial}>
              <Text style={reaction ? styles.selectedReaction : styles.reactionText}>{reactionLabel(reaction)} · {compactCount(reactionCount)}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={openSocial}>
              <Text style={styles.reactionText}>COMMENTS · {compactCount(commentCount)}</Text>
            </Pressable>
            <Text style={styles.reactionText}>↗ SHARE</Text>
          </View>
          <Pressable accessibilityRole="button" disabled={!item.challengeSlug} onPress={openChallenge} style={[styles.cta, !item.challengeSlug && styles.ctaDisabled]}>
            <Text style={styles.ctaText}>{item.action} →</Text>
          </Pressable>
        </View>
      </View>

      <PostSocialModal
        visible={socialOpen}
        postId={item.id}
        authorId={item.userId}
        authorName={item.user}
        reaction={reaction}
        onClose={() => setSocialOpen(false)}
        onReactionChanged={(next, delta) => {
          setReaction(next);
          setReactionCount((current) => Math.max(0, current + delta));
        }}
        onCommentCountChanged={(delta) => setCommentCount((current) => Math.max(0, current + delta))}
        onBlocked={(userId) => onBlocked?.(userId)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 10,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
  },
  visual: {
    flex: 1,
    minHeight: 360,
    backgroundColor: colors.panel2,
    padding: 20,
    justifyContent: "flex-end",
    borderBottomWidth: 1,
    overflow: "hidden",
  },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.24)",
  },
  top: {
    position: "absolute",
    top: spacing.lg,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  kind: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    backgroundColor: "rgba(9,10,12,0.72)",
  },
  day: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
    backgroundColor: "rgba(9,10,12,0.72)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  value: {
    color: colors.text,
    fontSize: 76,
    fontWeight: "900",
    letterSpacing: -5,
  },
  challenge: {
    color: colors.text,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowRadius: 8,
  },
  copy: {
    padding: spacing.lg,
  },
  userRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  user: {
    color: colors.text,
    fontWeight: "900",
    flex: 1,
  },
  handle: {
    color: colors.muted,
    fontWeight: "700",
  },
  follow: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 0.8 },
  following: { color: colors.muted },
  caption: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
    marginTop: 10,
  },
  reactions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginVertical: 14,
  },
  reactionText: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  selectedReaction: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 0.6 },
  cta: {
    backgroundColor: colors.hot,
    padding: 14,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.45 },
  ctaText: {
    color: colors.bg,
    fontWeight: "900",
  },
});
