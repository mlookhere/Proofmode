import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { fetchProfileSnapshot, fetchPublicProfile, type ProfileSnapshot, type PublicProfile } from "@/api/profile";
import { Eyebrow, PrimaryButton, Screen, Surface } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase";
import { captureCanonicalOpen, shareCanonical } from "@/sharing";
import { colors, radius, spacing } from "@/theme";

export default function PublicPassportScreen() {
  const router = useRouter();
  const { handle, src } = useLocalSearchParams<{ handle: string; src?: string }>();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !handle) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const [nextProfile, nextSnapshot] = await Promise.all([fetchPublicProfile(handle), fetchProfileSnapshot(handle)]);
      setProfile(nextProfile);
      setSnapshot(nextSnapshot);
    } catch { setError("Could not load this Passport."); }
    finally { setLoading(false); }
  }, [handle]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (handle) void captureCanonicalOpen({ source: src || "passport_link", path: `/u/${handle}` });
  }, [handle, src]);

  if (loading) return <Screen contentStyle={styles.centered}><ActivityIndicator color={colors.hot} /></Screen>;
  if (!profile || !snapshot) return <Screen contentStyle={styles.centered}><Eyebrow>PASSPORT NOT AVAILABLE</Eyebrow><Text style={styles.title}>THIS PROFILE ISN’T VISIBLE.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton onPress={() => router.replace("/(tabs)/explore")}>EXPLORE DROPS</PrimaryButton></Screen>;

  return <Screen>
    <Eyebrow>RECEIPT PASSPORT</Eyebrow>
    <View style={styles.identity}>
      {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} /> : <View style={styles.avatarFallback}><Text style={styles.avatarMark}>P</Text></View>}
      <View style={styles.identityCopy}><Text style={styles.title}>{(profile.display_name || `@${profile.handle}`).toUpperCase()}</Text><Text style={styles.handle}>@{profile.handle}</Text></View>
    </View>
    {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
    <Surface style={styles.scoreCard}><Text style={styles.scoreLabel}>PROOF SCORE</Text><Text style={styles.score}>{snapshot.proof_score}</Text><Text style={styles.muted}>Public credibility only. Purchased plan never changes this score.</Text></Surface>
    <View style={styles.stats}>
      <View style={styles.stat}><Text style={styles.statValue}>{snapshot.receipts}</Text><Text style={styles.statLabel}>RECEIPTS</Text></View>
      <View style={styles.stat}><Text style={styles.statValue}>{snapshot.verified_receipts}</Text><Text style={styles.statLabel}>VERIFIED</Text></View>
      <View style={styles.stat}><Text style={styles.statValue}>{snapshot.best_streak}</Text><Text style={styles.statLabel}>BEST STREAK</Text></View>
    </View>
    <PrimaryButton onPress={() => void shareCanonical({ title: `${profile.display_name || `@${profile.handle}`} · ProofMode`, text: `See @${profile.handle}'s public ProofMode Passport.`, path: `/u/${profile.handle}`, source: "passport_share" }).catch(() => setError("Could not open share sheet."))}>SHARE PASSPORT</PrimaryButton>
    <Text style={styles.section}>ACTIVE JOURNEYS</Text>
    {snapshot.active_journeys.length === 0 ? <Text style={styles.muted}>No public active Journeys.</Text> : snapshot.active_journeys.map((journey) => <Pressable key={journey.id} onPress={() => router.push(`/journey/${journey.id}`)}><Surface style={styles.journey}><Text style={styles.journeyTitle}>{journey.challenge_title}</Text><Text style={styles.muted}>Attempt #{journey.attempt_no} · {journey.verified_count} verified · best {journey.best_streak}</Text></Surface></Pressable>)}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: "center", gap: spacing.md },
  identity: { flexDirection: "row", gap: spacing.md, alignItems: "center", marginTop: spacing.xl },
  identityCopy: { flex: 1 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.panel2 },
  avatarFallback: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.hot, alignItems: "center", justifyContent: "center" },
  avatarMark: { color: colors.bg, fontSize: 30, fontWeight: "900" },
  title: { color: colors.text, fontSize: 36, lineHeight: 35, fontWeight: "900", letterSpacing: -2 },
  handle: { color: colors.muted, fontWeight: "800", marginTop: 4 },
  bio: { color: colors.text, lineHeight: 22, marginTop: spacing.lg },
  scoreCard: { padding: spacing.lg, marginVertical: spacing.xl },
  scoreLabel: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  score: { color: colors.text, fontSize: 56, fontWeight: "900", letterSpacing: -3 },
  muted: { color: colors.muted, lineHeight: 20 },
  stats: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  stat: { flex: 1, backgroundColor: colors.panel2, borderRadius: radius.md, padding: 12 },
  statValue: { color: colors.text, fontSize: 24, fontWeight: "900" },
  statLabel: { color: colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 0.7 },
  section: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm },
  journey: { padding: spacing.md, marginBottom: spacing.sm },
  journeyTitle: { color: colors.text, fontWeight: "900", marginBottom: 4 },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.md },
});
