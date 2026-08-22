import { Pressable, StyleSheet, Text, View } from "react-native";
import type { FeedPost } from "@/domain";
import { colors, radius, spacing } from "@/theme";

export function FeedCard({ item, height }: { item: FeedPost; height: number }) {
  return (
    <View style={[styles.card, { height }]}>
      <View style={[styles.visual, { borderColor: item.accent }]}>
        <View style={styles.top}>
          <Text style={[styles.kind, { color: item.accent, borderColor: item.accent }]}>{item.kind.toUpperCase()}</Text>
          <Text style={styles.day}>{item.day}</Text>
        </View>
        <Text style={styles.value}>{item.value}</Text>
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
  },
  day: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  value: {
    color: colors.text,
    fontSize: 76,
    fontWeight: "900",
    letterSpacing: -5,
  },
  challenge: {
    color: colors.muted,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
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
