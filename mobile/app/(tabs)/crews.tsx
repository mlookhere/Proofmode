import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { fetchMyCrews, type CrewSummary } from "@/api/social";
import { useAuth } from "@/auth/session";
import { AuthRequired } from "@/components/auth-required";
import { Eyebrow, PrimaryButton, Screen, Surface } from "@/components/ui";
import { colors, spacing } from "@/theme";

function activityDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
}

export default function Crews() {
  const router = useRouter();
  const { session, isLoading: isSessionLoading } = useAuth();
  const [crews, setCrews] = useState<readonly CrewSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      setCrews(await fetchMyCrews());
    } catch {
      setError("Could not load your Crews.");
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  if (isSessionLoading) return <Screen />;
  if (!session) return <AuthRequired title="YOUR CREWS LIVE HERE." message="Sign in to see private rooms, members, activity, and Crew threads tied to your account." />;

  return (
    <Screen>
      <Eyebrow>YOUR ROOMS</Eyebrow>
      <Text style={styles.h1}>CREWS.</Text>
      <Text style={styles.lede}>Private challenge rooms for the people doing the work with you.</Text>

      {isLoading && crews.length === 0 ? <ActivityIndicator color={colors.hot} /> : null}
      {error ? (
        <View style={styles.errorState}>
          <Text style={styles.error}>{error}</Text>
          <PrimaryButton onPress={() => void load()}>RETRY</PrimaryButton>
        </View>
      ) : null}

      {!isLoading && !error && crews.length === 0 ? (
        <Surface style={styles.empty}>
          <Text style={styles.emptyTitle}>NO CREWS YET.</Text>
          <Text style={styles.emptyCopy}>Join or create a Crew-format challenge and it will appear here.</Text>
        </Surface>
      ) : null}

      <View style={styles.list}>
        {crews.map((crew) => (
          <Pressable accessibilityRole="button" key={crew.id} onPress={() => router.push(`/crew/${crew.id}`)}>
            <Surface style={styles.crew}>
              <Text style={styles.emoji}>{crew.coverEmoji ?? "◉"}</Text>
              <View style={styles.crewCopy}>
                <Text style={styles.crewTitle}>{crew.title.toUpperCase()}</Text>
                <Text style={styles.meta}>{crew.memberCount.toLocaleString()} MEMBERS · ACTIVE {activityDate(crew.lastActivityAt)}</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
            </Surface>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 60, fontWeight: "900", letterSpacing: -4, marginTop: spacing.sm },
  lede: { color: colors.muted, lineHeight: 21, marginBottom: 20 },
  list: { gap: spacing.sm },
  crew: { padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md },
  emoji: { fontSize: 30 },
  crewCopy: { flex: 1 },
  crewTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  meta: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.7, marginTop: spacing.xs },
  arrow: { color: colors.hot, fontSize: 24, fontWeight: "900" },
  empty: { padding: spacing.xl },
  emptyTitle: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: -0.7 },
  emptyCopy: { color: colors.muted, lineHeight: 21, marginTop: spacing.sm },
  errorState: { gap: spacing.md, marginBottom: spacing.lg },
  error: { color: colors.danger, lineHeight: 20 },
});
