import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/session";
import {
  emptyProfileSnapshot,
  fetchMyProfile,
  fetchProfileSnapshot,
  type PassportJourney,
  type Profile,
  type ProfileSnapshot,
} from "@/api/profile";
import { fetchMyBlocks, setBlock, type BlockedUser } from "@/api/social";
import { AuthRequired } from "@/components/auth-required";
import { PrimaryButton, Screen, Surface } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

function JourneyRow({ item, onPress }: { item: PassportJourney; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.journeyRow}>
      <View style={styles.journeyCopy}>
        <Text style={styles.journeyTitle}>{item.challenge_title}</Text>
        <Text style={styles.journeyMeta}>ATTEMPT #{item.attempt_no} · {item.status.toUpperCase()}</Text>
      </View>
      <View style={styles.journeyNumbers}>
        <Text style={styles.journeyVerified}>{item.verified_count} VERIFIED</Text>
        <Text style={styles.journeyMeta}>BEST {item.best_streak}</Text>
      </View>
    </Pressable>
  );
}

export default function You() {
  const router = useRouter();
  const { session, isLoading: isSessionLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [snapshot, setSnapshot] = useState<ProfileSnapshot>(emptyProfileSnapshot);
  const [blockedUsers, setBlockedUsers] = useState<readonly BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);

    try {
      const nextProfile = await fetchMyProfile(session.user.id);
      const [nextSnapshot, nextBlocks] = await Promise.all([
        nextProfile.handle ? fetchProfileSnapshot(nextProfile.handle) : Promise.resolve(null),
        fetchMyBlocks(),
      ]);
      setProfile(nextProfile);
      setSnapshot(nextSnapshot ?? emptyProfileSnapshot);
      setBlockedUsers(nextBlocks);
    } catch {
      setError("Could not load your Passport.");
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  async function unblock(userId: string) {
    if (isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      await setBlock(userId, false);
      setBlockedUsers((current) => current.filter((user) => user.id !== userId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not unblock user.");
    } finally {
      setIsMutating(false);
    }
  }

  if (isSessionLoading) return <Screen />;
  if (!session) return <AuthRequired title="THIS IS YOUR PASSPORT." message="Sign in to see your Proof Score, verified receipts, streaks, Journeys, and Trophy Case." />;

  if (isLoading && !profile) {
    return <Screen contentStyle={styles.centered}><ActivityIndicator color={colors.hot} /></Screen>;
  }

  if (error && !profile) {
    return (
      <Screen contentStyle={styles.centered}>
        <Text style={styles.error}>{error}</Text>
        <PrimaryButton onPress={() => void load()}>RETRY</PrimaryButton>
      </Screen>
    );
  }

  const name = profile?.display_name?.trim() || profile?.handle || session.user.email || "PROVER";
  const initial = name.charAt(0).toUpperCase();
  const handle = profile?.handle ? `@${profile.handle}` : session.user.email || "";
  const plan = profile?.plan ? profile.plan.toUpperCase() : "FREE";
  const stats = [
    { value: snapshot.verified_receipts, label: "VERIFIED" },
    { value: snapshot.completed_drops, label: "DROPS DONE" },
    { value: snapshot.current_streak, label: "CURRENT STREAK" },
    { value: snapshot.best_streak, label: "BEST STREAK" },
    { value: snapshot.comeback_count, label: "COMEBACKS" },
    { value: snapshot.founder_badges, label: "FOUNDER" },
    { value: snapshot.recruits, label: "RECRUITS" },
    { value: snapshot.receipts, label: "RECEIPTS" },
  ] as const;

  return (
    <Screen>
      <View style={styles.head}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.name}>{name.toUpperCase()}</Text>
          <Text numberOfLines={1} style={styles.handle}>{handle} · {plan}</Text>
        </View>
      </View>

      <Surface style={styles.score}>
        <Text style={styles.scoreLabel}>PROOF SCORE</Text>
        <Text style={styles.scoreValue}>{snapshot.proof_score.toLocaleString()}</Text>
        <Text style={styles.scoreNote}>Earned from proof history. Your plan does not change this score.</Text>
      </Surface>

      <View style={styles.stats}>
        {stats.map((stat) => (
          <View style={styles.stat} key={stat.label}>
            <Text style={styles.statValue}>{stat.value.toLocaleString()}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionLabel}>ACTIVE JOURNEYS</Text>
      {snapshot.active_journeys.length > 0 ? (
        <Surface style={styles.list}>
          {snapshot.active_journeys.map((item) => <JourneyRow key={item.id} item={item} onPress={() => router.push(`/journey/${item.id}`)} />)}
        </Surface>
      ) : <Text style={styles.empty}>No active Journey yet. Join a Drop to start one.</Text>}

      <Text style={styles.sectionLabel}>TROPHY CASE</Text>
      {snapshot.trophy_case.length > 0 ? (
        <Surface style={styles.list}>
          {snapshot.trophy_case.map((item) => <JourneyRow key={item.id} item={item} onPress={() => router.push(`/journey/${item.id}`)} />)}
        </Surface>
      ) : <Text style={styles.empty}>Completed Drops will stay here even after you reset.</Text>}

      <Text style={styles.sectionLabel}>RECENT POSTS</Text>
      {snapshot.recent_posts.length > 0 ? (
        <Surface style={styles.list}>
          {snapshot.recent_posts.slice(0, 8).map((post) => (
            <Pressable
              accessibilityRole={post.journey_id ? "button" : undefined}
              disabled={!post.journey_id}
              key={post.post_id}
              onPress={() => post.journey_id && router.push(`/journey/${post.journey_id}`)}
              style={styles.postRow}
            >
              <Text style={styles.postKind}>{post.kind.toUpperCase()}</Text>
              <View style={styles.journeyCopy}>
                <Text style={styles.journeyTitle}>{post.challenge_title || "PROOFMODE"}</Text>
                <Text numberOfLines={1} style={styles.postCaption}>{post.caption?.trim() || "Proof posted."}</Text>
              </View>
            </Pressable>
          ))}
        </Surface>
      ) : <Text style={styles.empty}>Your public Journey posts will appear here.</Text>}

      <Text style={styles.sectionLabel}>SETTINGS</Text>
      <Surface style={styles.list}>
        <Pressable accessibilityRole="button" onPress={() => router.push("/settings/notifications")} style={styles.settingsRow}>
          <View style={styles.journeyCopy}>
            <Text style={styles.journeyTitle}>NOTIFICATIONS</Text>
            <Text style={styles.journeyMeta}>DEVICE PUSH · CLASSES · QUIET HOURS</Text>
          </View>
          <Text style={styles.settingsArrow}>›</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push("/settings/billing")} style={styles.settingsRow}>
          <View style={styles.journeyCopy}>
            <Text style={styles.journeyTitle}>MEMBERSHIP</Text>
            <Text style={styles.journeyMeta}>PROOF+ · CREATOR · RESTORE</Text>
          </View>
          <Text style={styles.settingsArrow}>›</Text>
        </Pressable>
      </Surface>

      {blockedUsers.length > 0 ? (
        <View style={styles.blockedSection}>
          <Text style={styles.sectionLabel}>BLOCKED USERS</Text>
          <Surface style={styles.list}>
            {blockedUsers.map((user) => (
              <View key={user.id} style={styles.blockedRow}>
                <View style={styles.journeyCopy}>
                  <Text style={styles.journeyTitle}>{user.displayName}</Text>
                  {user.handle ? <Text style={styles.journeyMeta}>@{user.handle}</Text> : null}
                </View>
                <Pressable accessibilityRole="button" disabled={isMutating} onPress={() => void unblock(user.id)}>
                  <Text style={styles.unblock}>UNBLOCK</Text>
                </Pressable>
              </View>
            ))}
          </Surface>
        </View>
      ) : null}

      {isMutating ? <ActivityIndicator color={colors.hot} style={styles.mutating} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton onPress={() => void signOut()}>SIGN OUT</PrimaryButton>
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center", flexGrow: 1, gap: spacing.md },
  head: { flexDirection: "row", gap: 13, alignItems: "center", marginTop: spacing.md },
  identity: { flex: 1 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: colors.hot, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 25, fontWeight: "900", color: colors.bg },
  name: { color: colors.text, fontSize: 23, fontWeight: "900" },
  handle: { color: colors.muted, marginTop: 3 },
  score: { marginTop: spacing.xl, padding: 20 },
  scoreLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  scoreValue: { color: colors.text, fontSize: 64, fontWeight: "900", letterSpacing: -4 },
  scoreNote: { color: colors.muted, lineHeight: 18, marginTop: 4 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  stat: { width: "48%", backgroundColor: colors.panel2, borderRadius: radius.md, padding: 14 },
  statValue: { color: colors.text, fontSize: 25, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 3 },
  sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  empty: { color: colors.muted, lineHeight: 20 },
  list: { paddingHorizontal: spacing.md },
  journeyRow: { minHeight: 70, flexDirection: "row", alignItems: "center", gap: spacing.sm, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  journeyCopy: { flex: 1 },
  journeyTitle: { color: colors.text, fontWeight: "900" },
  journeyMeta: { color: colors.muted, fontSize: 10, fontWeight: "800", marginTop: 3 },
  journeyNumbers: { alignItems: "flex-end" },
  journeyVerified: { color: colors.hot, fontSize: 10, fontWeight: "900" },
  postRow: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  postKind: { color: colors.hot, fontSize: 9, fontWeight: "900", width: 70 },
  postCaption: { color: colors.muted, marginTop: 3 },
  settingsRow: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  settingsArrow: { color: colors.hot, fontSize: 28, fontWeight: "700" },
  blockedSection: { marginBottom: spacing.xl },
  blockedRow: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  unblock: { color: colors.hot, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  mutating: { marginBottom: spacing.md },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.md },
});
