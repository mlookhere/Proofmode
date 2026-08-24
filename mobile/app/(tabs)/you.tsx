import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/auth/session";
import { fetchMyProfile, fetchProfileSnapshot, type Profile, type ProfileSnapshot } from "@/api/profile";
import { fetchMyBlocks, setBlock, type BlockedUser } from "@/api/social";
import { AuthRequired } from "@/components/auth-required";
import { PrimaryButton, Screen, Surface } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

const emptySnapshot: ProfileSnapshot = {
  receipts: 0,
  verified_receipts: 0,
  founder_badges: 0,
  recruits: 0,
  proof_score: 0,
};

export default function You() {
  const { session, isLoading: isSessionLoading, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [snapshot, setSnapshot] = useState<ProfileSnapshot>(emptySnapshot);
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
      setSnapshot(nextSnapshot ?? emptySnapshot);
      setBlockedUsers(nextBlocks);
    } catch {
      setError("Could not load your profile.");
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

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
  if (!session) return <AuthRequired title="THIS IS YOUR RECEIPT WALL." message="Sign in to see your profile, proof score, receipts, and founder badges." />;

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
    { value: snapshot.receipts, label: "RECEIPTS" },
    { value: snapshot.founder_badges, label: "FOUNDER" },
    { value: snapshot.recruits, label: "RECRUITS" },
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
      </Surface>

      <View style={styles.stats}>
        {stats.map((stat) => (
          <View style={styles.stat} key={stat.label}>
            <Text style={styles.statValue}>{stat.value.toLocaleString()}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {blockedUsers.length > 0 ? (
        <View style={styles.blockedSection}>
          <Text style={styles.sectionLabel}>BLOCKED USERS</Text>
          <Surface style={styles.blockedList}>
            {blockedUsers.map((user) => (
              <View key={user.id} style={styles.blockedRow}>
                <View style={styles.blockedCopy}>
                  <Text style={styles.blockedName}>{user.displayName}</Text>
                  {user.handle ? <Text style={styles.blockedHandle}>@{user.handle}</Text> : null}
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
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.sm },
  stat: { width: "48%", backgroundColor: colors.panel2, borderRadius: radius.md, padding: 14 },
  statValue: { color: colors.text, fontSize: 25, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 3 },
  blockedSection: { marginVertical: spacing.xl },
  sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: spacing.sm },
  blockedList: { paddingHorizontal: spacing.md },
  blockedRow: { minHeight: 58, flexDirection: "row", alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  blockedCopy: { flex: 1 },
  blockedName: { color: colors.text, fontWeight: "900" },
  blockedHandle: { color: colors.muted, marginTop: 2 },
  unblock: { color: colors.hot, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  mutating: { marginBottom: spacing.md },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.md },
});
