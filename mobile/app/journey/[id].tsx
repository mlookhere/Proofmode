import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { joinChallenge } from "@/api/challenges";
import {
  ensureJourney,
  fetchJourneySnapshot,
  resetJourney,
  setJourneyFollow,
  setProofVerification,
  type JourneySnapshot,
  type JourneyTimelineItem,
} from "@/api/journey";
import { createResetToken } from "@/api/media";
import { useAuth } from "@/auth/session";
import { Eyebrow, PrimaryButton, Screen, Surface } from "@/components/ui";
import { shareCanonical } from "@/sharing";
import { colors, radius, spacing } from "@/theme";

function JourneyVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = true; instance.muted = true; });
  return <VideoView player={player} nativeControls style={styles.media} contentFit="cover" />;
}

function TimelineItem({ item, busy, onVerify, onOpenReceipt }: { item: JourneyTimelineItem; busy: boolean; onVerify: (proofId: string, verdict: boolean) => void; onOpenReceipt: (proofId: string) => void }) {
  const date = new Date(item.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
  return <Surface style={styles.timelineCard}>
    <View style={styles.timelineHead}><Text style={styles.kind}>{item.kind.toUpperCase()}</Text><Text style={styles.date}>{date}</Text></View>
    {item.media_kind === "image" && item.media_public_url ? <Image source={{ uri: item.media_public_url }} style={styles.media} /> : null}
    {item.media_kind === "video" && item.media_public_url ? <JourneyVideo uri={item.media_public_url} /> : null}
    <Text style={styles.caption}>{item.caption?.trim() || "Proof posted."}</Text>
    {item.proof_id ? <View style={styles.receiptRow}>
      <Pressable accessibilityRole="button" onPress={() => onOpenReceipt(item.proof_id!)}><Text style={[styles.receipt, item.proof_verified && styles.verified]}>{item.proof_verified ? "VERIFIED RECEIPT →" : "RECEIPT →"}</Text></Pressable>
      {item.viewer_can_verify ? <View style={styles.verifyRow}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => onVerify(item.proof_id!, true)}><Text style={[styles.verifyAction, item.viewer_verdict === true && styles.activeAction]}>VERIFY</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={busy} onPress={() => onVerify(item.proof_id!, false)}><Text style={[styles.verifyAction, item.viewer_verdict === false && styles.rejectAction]}>REJECT</Text></Pressable>
      </View> : null}
    </View> : null}
  </Surface>;
}

export default function JourneyScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const [journey, setJourney] = useState<JourneySnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    try { setJourney(await fetchJourneySnapshot(id)); }
    catch { setJourney(null); setError("Could not load this Journey."); }
    finally { setIsLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  function requireSignIn() {
    if (session || !journey) return false;
    router.push({ pathname: "/auth", params: { returnTo: `/journey/${journey.id}` } });
    return true;
  }

  async function toggleFollow() {
    if (!journey || busy || requireSignIn()) return;
    setBusy(true); setError(null);
    try { await setJourneyFollow(journey.id, !journey.viewer_following); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update Journey follow."); }
    finally { setBusy(false); }
  }

  async function startSameDrop() {
    if (!journey || busy || requireSignIn()) return;
    setBusy(true); setError(null);
    try {
      if (!journey.viewer_is_member) await joinChallenge(journey.challenge_slug);
      const nextId = await ensureJourney(journey.challenge_id);
      router.replace(`/journey/${nextId}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start this Drop."); }
    finally { setBusy(false); }
  }

  async function runItBack() {
    if (!journey || busy || !journey.viewer_is_owner || requireSignIn()) return;
    setBusy(true); setError(null);
    try { const nextId = await resetJourney(journey.challenge_id, createResetToken()); router.replace(`/journey/${nextId}`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start the next attempt."); }
    finally { setBusy(false); }
  }

  async function verify(proofId: string, verdict: boolean) {
    if (busy || requireSignIn()) return;
    setBusy(true); setError(null);
    try { await setProofVerification(proofId, verdict); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update verification."); }
    finally { setBusy(false); }
  }

  async function shareJourney() {
    if (!journey) return;
    try {
      await shareCanonical({ title: `${journey.display_name} · ${journey.challenge_title}`, text: `Follow ${journey.handle ? `@${journey.handle}` : journey.display_name}'s Journey on ${journey.challenge_title}.`, path: `/j/${journey.id}`, source: "journey_share" });
    } catch { setError("Could not open share sheet."); }
  }

  if (isLoading) return <Screen contentStyle={styles.centered}><ActivityIndicator color={colors.hot} /></Screen>;
  if (!journey) return <Screen contentStyle={styles.centered}><Eyebrow>JOURNEY NOT FOUND</Eyebrow><Text style={styles.title}>THIS STORY ISN’T VISIBLE.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton onPress={() => router.replace("/(tabs)/explore")}>EXPLORE DROPS</PrimaryButton></Screen>;

  const handle = journey.handle ? `@${journey.handle}` : "";
  return <Screen>
    <Eyebrow>FOLLOW THE STORY, NOT JUST THE ACCOUNT</Eyebrow>
    <Text style={styles.title}>{journey.challenge_title.toUpperCase()}</Text>
    <Text style={styles.person}>{journey.display_name.toUpperCase()} {handle ? <Text style={styles.handle}>{handle}</Text> : null}</Text>

    <Surface style={styles.attempt}><View><Text style={styles.label}>ATTEMPT</Text><Text style={styles.attemptValue}>#{journey.attempt_no}</Text></View><View style={styles.attemptMeta}><Text style={styles.status}>{journey.status.toUpperCase()}</Text><Text style={styles.muted}>STARTED {new Date(journey.started_at).toLocaleDateString()}</Text></View></Surface>
    <View style={styles.stats}><View style={styles.stat}><Text style={styles.statValue}>{journey.verified_count}</Text><Text style={styles.statLabel}>VERIFIED</Text></View><View style={styles.stat}><Text style={styles.statValue}>{journey.current_streak}</Text><Text style={styles.statLabel}>CURRENT</Text></View><View style={styles.stat}><Text style={styles.statValue}>{journey.best_streak}</Text><Text style={styles.statLabel}>BEST</Text></View></View>

    <View style={styles.actions}>
      {journey.viewer_is_owner ? <PrimaryButton onPress={busy ? undefined : () => void runItBack()}>{busy ? "WORKING…" : "RUN IT BACK"}</PrimaryButton> : <><PrimaryButton onPress={busy ? undefined : () => void toggleFollow()}>{journey.viewer_following ? "UNFOLLOW JOURNEY" : "FOLLOW JOURNEY"}</PrimaryButton><PrimaryButton onPress={busy ? undefined : () => void startSameDrop()} style={styles.secondary} textStyle={styles.secondaryText}>{journey.viewer_is_member ? "START FROM DAY 1" : "JOIN SAME DROP"}</PrimaryButton></>}
      <PrimaryButton onPress={() => void shareJourney()} style={styles.secondary} textStyle={styles.secondaryText}>SHARE JOURNEY</PrimaryButton>
    </View>
    {error ? <Text style={styles.error}>{error}</Text> : null}

    <Text style={styles.sectionTitle}>THE JOURNEY</Text>
    {journey.timeline.length === 0 ? <Text style={styles.muted}>No published chapters yet.</Text> : journey.timeline.map((item) => <TimelineItem key={item.post_id} item={item} busy={busy} onVerify={(proofId, verdict) => void verify(proofId, verdict)} onOpenReceipt={(proofId) => router.push(`/r/${proofId}`)} />)}
  </Screen>;
}

const styles = StyleSheet.create({
  centered: { justifyContent: "center", flexGrow: 1, gap: spacing.md },
  title: { color: colors.text, fontSize: 42, lineHeight: 40, fontWeight: "900", letterSpacing: -2.5, marginTop: spacing.md },
  person: { color: colors.text, fontSize: 15, fontWeight: "900", marginTop: spacing.md },
  handle: { color: colors.muted, fontWeight: "700" },
  attempt: { marginTop: spacing.xl, padding: spacing.lg, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  attemptValue: { color: colors.hot, fontSize: 42, fontWeight: "900", letterSpacing: -2 },
  attemptMeta: { alignItems: "flex-end", gap: 5 },
  status: { color: colors.text, fontWeight: "900" },
  muted: { color: colors.muted, lineHeight: 20 },
  stats: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  stat: { flex: 1, backgroundColor: colors.panel2, borderRadius: radius.md, padding: 13 },
  statValue: { color: colors.text, fontSize: 28, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  secondary: { backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1 },
  secondaryText: { color: colors.text },
  sectionTitle: { color: colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  timelineCard: { padding: spacing.md, marginBottom: spacing.sm },
  timelineHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kind: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  date: { color: colors.muted, fontSize: 10, fontWeight: "800" },
  media: { width: "100%", height: 220, borderRadius: radius.md, marginTop: spacing.md, backgroundColor: colors.panel2 },
  caption: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: "700", marginTop: spacing.md },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  receipt: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  verified: { color: colors.hot },
  verifyRow: { flexDirection: "row", gap: spacing.md },
  verifyAction: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  activeAction: { color: colors.hot },
  rejectAction: { color: colors.danger },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.md },
});
