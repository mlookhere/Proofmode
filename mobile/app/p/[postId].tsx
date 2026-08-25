import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Image, StyleSheet, Text } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { fetchPublicPostShare, type PublicPostShare } from "@/api/sharing";
import { Eyebrow, PrimaryButton, Screen } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase";
import { captureCanonicalOpen, shareCanonical } from "@/sharing";
import { colors, radius, spacing } from "@/theme";

function PostVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => { instance.loop = false; instance.muted = false; });
  return <VideoView player={player} nativeControls contentFit="cover" style={styles.media} />;
}

export default function PublicPostScreen() {
  const router = useRouter();
  const { postId, src } = useLocalSearchParams<{ postId: string; src?: string }>();
  const [post, setPost] = useState<PublicPostShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !postId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try { setPost(await fetchPublicPostShare(postId)); }
    catch { setError("Could not load this public post."); }
    finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (postId) void captureCanonicalOpen({ source: src || "post_link", path: `/p/${postId}` });
  }, [postId, src]);

  if (loading) return <Screen contentStyle={styles.centered}><ActivityIndicator color={colors.hot} /></Screen>;
  if (!post) return <Screen contentStyle={styles.centered}><Eyebrow>POST NOT AVAILABLE</Eyebrow><Text style={styles.title}>THIS POST ISN’T PUBLIC.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton onPress={() => router.replace("/(tabs)/index")}>BACK TO HOME</PrimaryButton></Screen>;

  const owner = post.handle ? `@${post.handle}` : post.display_name || "ProofMode member";
  return <Screen>
    <Eyebrow>{post.kind.toUpperCase()}</Eyebrow>
    <Text style={styles.title}>{(post.challenge_title || "PROOFMODE").toUpperCase()}</Text>
    <Text style={styles.owner}>{owner}</Text>
    {post.media_kind === "image" && post.media_public_url ? <Image source={{ uri: post.media_public_url }} style={styles.media} resizeMode="cover" /> : null}
    {post.media_kind === "video" && post.media_public_url ? <PostVideo uri={post.media_public_url} /> : null}
    <Text style={styles.caption}>{post.caption?.trim() || "Proof posted."}</Text>
    <Text style={styles.date}>{new Date(post.published_at).toLocaleDateString()}</Text>
    <PrimaryButton onPress={() => void shareCanonical({ title: post.challenge_title || "ProofMode", text: post.caption || "See what happened on ProofMode.", path: `/p/${post.id}`, source: "post_share" }).catch(() => setError("Could not open share sheet."))}>SHARE POST</PrimaryButton>
    {post.proof_id ? <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => router.push(`/r/${post.proof_id}`)}>VIEW RECEIPT</PrimaryButton> : null}
    {post.journey_id ? <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => router.push(`/journey/${post.journey_id}`)}>FOLLOW JOURNEY</PrimaryButton> : null}
    {post.challenge_slug ? <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => router.push(`/challenge/${post.challenge_slug}`)}>TRY THIS DROP</PrimaryButton> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: "center", gap: spacing.md },
  title: { color: colors.text, fontSize: 42, lineHeight: 40, fontWeight: "900", letterSpacing: -2.3, marginTop: spacing.md },
  owner: { color: colors.muted, fontWeight: "800", marginTop: spacing.sm },
  media: { width: "100%", height: 420, borderRadius: radius.lg, backgroundColor: colors.panel2, marginTop: spacing.xl },
  caption: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: "700", marginVertical: spacing.lg },
  date: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: spacing.lg },
  secondary: { backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1, marginTop: spacing.sm },
  secondaryText: { color: colors.text },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.md },
});
