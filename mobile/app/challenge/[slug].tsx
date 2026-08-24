import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import {
  fetchChallengeBySlug,
  fetchChallengeViewerState,
  joinChallenge,
  setChallengeWatched,
  type ChallengeViewerState,
  type PublicChallenge,
} from "@/api/challenges";
import { useAuth } from "@/auth/session";
import { ReportModal } from "@/components/report-modal";
import { Eyebrow, PrimaryButton, Screen, Surface } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase";
import { colors, radius, spacing } from "@/theme";

const emptyViewerState: ChallengeViewerState = { joined: false, watched: false };

type PendingAction = "join" | "watch";

export default function ChallengeScreen() {
  const router = useRouter();
  const { slug, action } = useLocalSearchParams<{ slug: string; action?: PendingAction }>();
  const { session } = useAuth();
  const handledAction = useRef<string | null>(null);
  const [challenge, setChallenge] = useState<PublicChallenge | null>(null);
  const [viewerState, setViewerState] = useState<ChallengeViewerState>(emptyViewerState);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !slug) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const nextChallenge = await fetchChallengeBySlug(slug);
      setChallenge(nextChallenge);
      if (nextChallenge && session?.user.id) {
        setViewerState(await fetchChallengeViewerState(nextChallenge.id, session.user.id));
      } else {
        setViewerState(emptyViewerState);
      }
    } catch {
      setError("Could not load this Drop.");
    } finally {
      setIsLoading(false);
    }
  }, [session?.user.id, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(async (nextAction: PendingAction) => {
    if (!challenge) return;
    if (!session) {
      const returnTo = `/challenge/${challenge.slug}?action=${nextAction}`;
      router.push({ pathname: "/auth", params: { returnTo } });
      return;
    }

    setIsMutating(true);
    setError(null);
    try {
      if (nextAction === "join") {
        await joinChallenge(challenge.slug);
      } else {
        await setChallengeWatched(challenge.id, session.user.id, !viewerState.watched);
      }
      setViewerState(await fetchChallengeViewerState(challenge.id, session.user.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update this Drop.");
    } finally {
      setIsMutating(false);
    }
  }, [challenge, router, session, viewerState.watched]);

  useEffect(() => {
    if (!session || !challenge || (action !== "join" && action !== "watch")) return;
    const key = `${session.user.id}:${challenge.id}:${action}`;
    if (handledAction.current === key) return;
    handledAction.current = key;
    void runAction(action);
  }, [action, challenge, runAction, session]);

  function openReport() {
    if (!challenge) return;
    if (!session) {
      router.push({ pathname: "/auth", params: { returnTo: `/challenge/${challenge.slug}` } });
      return;
    }
    setReportOpen(true);
  }

  if (!isSupabaseConfigured) {
    return (
      <Screen contentStyle={styles.centered}>
        <Eyebrow>BACKEND NOT CONFIGURED</Eyebrow>
        <Text style={styles.title}>DROP ACTIONS ARE READY.</Text>
        <Text style={styles.copy}>Configure Supabase to load live Drops and persist Join or Watch state.</Text>
      </Screen>
    );
  }

  if (isLoading) {
    return <Screen contentStyle={styles.centered}><ActivityIndicator color={colors.hot} /></Screen>;
  }

  if (!challenge) {
    return (
      <Screen contentStyle={styles.centered}>
        <Eyebrow>DROP NOT FOUND</Eyebrow>
        <Text style={styles.title}>THIS ONE ISN’T PUBLIC.</Text>
        <PrimaryButton onPress={() => router.replace("/(tabs)/explore")}>BACK TO EXPLORE</PrimaryButton>
      </Screen>
    );
  }

  return (
    <>
      <Screen>
        <Eyebrow>PUBLIC DROP</Eyebrow>
        <Text style={styles.emoji}>{challenge.coverEmoji ?? "⚡"}</Text>
        <Text style={styles.title}>{challenge.title.toUpperCase()}</Text>
        <Text style={styles.copy}>{challenge.tagline ?? challenge.rule}</Text>

        <Surface style={styles.details}>
          <Text style={styles.detailLabel}>THE RULE</Text>
          <Text style={styles.detailValue}>{challenge.rule}</Text>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{challenge.durationDays} DAYS</Text>
            <Text style={styles.meta}>{challenge.category.toUpperCase()}</Text>
          </View>
        </Surface>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <PrimaryButton onPress={isMutating || viewerState.joined ? undefined : () => void runAction("join")}>
            {viewerState.joined ? "JOINED" : isMutating ? "WORKING…" : "JOIN DROP"}
          </PrimaryButton>
          <PrimaryButton onPress={isMutating ? undefined : () => void runAction("watch")} style={styles.secondaryButton}>
            {viewerState.watched ? "UNWATCH" : "WATCH"}
          </PrimaryButton>
          <PrimaryButton onPress={openReport} style={styles.reportButton}>REPORT DROP</PrimaryButton>
        </View>

        {!session ? <Text style={styles.note}>You can view this Drop without an account. Sign-in is only required when you Join, Watch, or Report.</Text> : null}
      </Screen>

      <ReportModal visible={reportOpen} targetType="challenge" targetId={challenge.id} onClose={() => setReportOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center", flexGrow: 1 },
  emoji: { fontSize: 46, marginTop: spacing.xl },
  title: { color: colors.text, fontSize: 44, lineHeight: 42, fontWeight: "900", letterSpacing: -2.5, marginTop: spacing.sm },
  copy: { color: colors.muted, fontSize: 17, lineHeight: 24, marginTop: spacing.md },
  details: { padding: spacing.lg, marginTop: spacing.xl },
  detailLabel: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  detailValue: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: "700", marginTop: spacing.sm },
  metaRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  meta: { color: colors.text, backgroundColor: colors.panel2, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, fontSize: 10, fontWeight: "900", overflow: "hidden" },
  actions: { gap: spacing.md, marginTop: spacing.xl },
  secondaryButton: { backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1 },
  reportButton: { backgroundColor: "transparent", borderColor: colors.line, borderWidth: 1 },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.lg },
  note: { color: colors.muted, lineHeight: 20, marginTop: spacing.lg },
});
