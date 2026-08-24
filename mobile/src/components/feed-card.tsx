import { useEffect } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import type { FeedPost } from "@/domain";
import { colors, radius, spacing } from "@/theme";

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

export function FeedCard({ item, height, active = false }: { item: FeedPost; height: number; active?: boolean }) {
  return (
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
        <Text style={styles.user}>
          {item.user} <Text style={styles.handle}>{item.handle}</Text>
        </Text>
        <Text style={styles.caption}>{item.caption}</Text>
        <View style={styles.reactions}>
          <Text>🔥 {item.reactions}</Text>
          <Text>💬 {item.comments}</Text>
          <Text>↗ Share</Text>
        </View>
        <Pressable accessibilityRole="button" style={styles.cta}>
          <Text style={styles.ctaText}>{item.action} →</Text>
        </Pressable>
      </View>
    </View>
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
  user: {
    color: colors.text,
    fontWeight: "900",
  },
  handle: {
    color: colors.muted,
    fontWeight: "700",
  },
  caption: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
    lineHeight: 24,
    marginTop: 10,
  },
  reactions: {
    flexDirection: "row",
    gap: spacing.lg,
    marginVertical: 14,
  },
  cta: {
    backgroundColor: colors.hot,
    padding: 14,
    borderRadius: radius.pill,
    alignItems: "center",
  },
  ctaText: {
    color: colors.bg,
    fontWeight: "900",
  },
});