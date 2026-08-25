import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { ActivityIndicator, Image, StyleSheet, Text } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { fetchPublicReceiptShare, type PublicReceiptShare } from "@/api/sharing";
import { Eyebrow, PrimaryButton, Screen, Surface } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase";
import { captureCanonicalOpen, receiptAssetUrl, shareCanonical } from "@/sharing";
import { colors, radius, spacing } from "@/theme";

function ReceiptVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = false; instance.muted = false; });
  return <VideoView player={player} nativeControls contentFit="cover" style={styles.media} />;
}

export default function ReceiptScreen() {
  const router = useRouter();
  const { receiptId, src } = useLocalSearchParams<{ receiptId: string; src?: string }>();
  const [receipt, setReceipt] = useState<PublicReceiptShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !receiptId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try { setReceipt(await fetchPublicReceiptShare(receiptId)); }
    catch { setError("Could not load this Receipt."); }
    finally { setLoading(false); }
  }, [receiptId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (receiptId) void captureCanonicalOpen({ source: src || "receipt_link", path: `/r/${receiptId}` });
  }, [receiptId, src]);

  if (loading) return <Screen contentStyle={styles.centered}><ActivityIndicator color={colors.hot} /></Screen>;
  if (!receipt) return <Screen contentStyle={styles.centered}><Eyebrow>RECEIPT NOT AVAILABLE</Eyebrow><Text style={styles.title}>THIS RECEIPT ISN’T PUBLIC.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton onPress={() => router.replace("/(tabs)/index")}>BACK TO HOME</PrimaryButton></Screen>;

  const owner = receipt.handle ? `@${receipt.handle}` : receipt.display_name || "ProofMode member";
  return <Screen>
    <Eyebrow>RECEIPT · VERIFIED × {receipt.verified_count}</Eyebrow>
    <Text style={styles.title}>{receipt.challenge_title.toUpperCase()}</Text>
    <Text style={styles.owner}>{owner}</Text>
    {receipt.media_kind === "image" && receipt.media_public_url ? <Image source={{ uri: receipt.media_public_url }} style={styles.media} resizeMode="cover" /> : null}
    {receipt.media_kind === "video" && receipt.media_public_url ? <ReceiptVideo uri={receipt.media_public_url} /> : null}
    <Surface style={styles.receiptCard}>
      <Text style={styles.rule}>{receipt.caption?.trim() || receipt.challenge_rule}</Text>
      <Text style={styles.date}>{receipt.proof_date}</Text>
    </Surface>
    <PrimaryButton onPress={() => void shareCanonical({ title: `${receipt.challenge_title} Receipt`, text: "No receipt. No streak. Beat me on ProofMode.", path: `/r/${receipt.id}`, source: "receipt_share" }).catch(() => setError("Could not open share sheet."))}>SHARE RECEIPT</PrimaryButton>
    <Text style={styles.section}>EXPORT RECEIPT</Text>
    <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => void Linking.openURL(receiptAssetUrl(receipt.id, "story"))}>9:16 STORY</PrimaryButton>
    <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => void Linking.openURL(receiptAssetUrl(receipt.id, "portrait"))}>4:5 PORTRAIT</PrimaryButton>
    <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => void Linking.openURL(receiptAssetUrl(receipt.id, "square"))}>1:1 SQUARE</PrimaryButton>
    {receipt.challenge_slug ? <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => router.push(`/challenge/${receipt.challenge_slug}`)}>JOIN THIS DROP</PrimaryButton> : null}
    {receipt.post_id ? <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => router.push(`/p/${receipt.post_id}`)}>VIEW POST</PrimaryButton> : null}
    {receipt.journey_id ? <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => router.push(`/journey/${receipt.journey_id}`)}>FOLLOW JOURNEY</PrimaryButton> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: "center", gap: spacing.md },
  title: { color: colors.text, fontSize: 42, lineHeight: 40, fontWeight: "900", letterSpacing: -2.3, marginTop: spacing.md },
  owner: { color: colors.muted, fontWeight: "800", marginTop: spacing.sm },
  media: { width: "100%", height: 360, borderRadius: radius.lg, backgroundColor: colors.panel2, marginTop: spacing.xl },
  receiptCard: { padding: spacing.lg, marginVertical: spacing.lg },
  rule: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: "800" },
  date: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: spacing.md },
  section: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: spacing.xl, marginBottom: spacing.sm },
  secondary: { backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1, marginTop: spacing.sm },
  secondaryText: { color: colors.text },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.md },
});
