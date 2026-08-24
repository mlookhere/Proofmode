import { useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { joinChallenge } from "@/api/challenges";
import { resolveInviteShare, type InviteShare } from "@/api/sharing";
import { useAuth } from "@/auth/session";
import { Eyebrow, PrimaryButton, Screen, Surface } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase";
import { captureCanonicalOpen, recordInviteClaimed } from "@/sharing";
import { colors, spacing } from "@/theme";

export default function InviteScreen() {
  const router = useRouter();
  const { code, src, action } = useLocalSearchParams<{ code: string; src?: string; action?: string }>();
  const { session } = useAuth();
  const handledAccept = useRef<string | null>(null);
  const [invite, setInvite] = useState<InviteShare | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const source = src || "invite_link";

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !code) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try { setInvite(await resolveInviteShare(code)); }
    catch { setError("Could not load this invite."); }
    finally { setLoading(false); }
  }, [code]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (code) void captureCanonicalOpen({ source, path: `/invite/${code}`, inviteCode: code });
  }, [code, source]);

  const accept = useCallback(async () => {
    if (!invite || !code || busy) return;
    if (!session) {
      const returnTo = `/invite/${code}?src=${encodeURIComponent(source)}&action=accept`;
      router.push({ pathname: "/auth", params: { returnTo } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const challengeId = await joinChallenge(invite.challenge_slug, code);
      await recordInviteClaimed(code, challengeId);
      router.replace(`/challenge/${invite.challenge_slug}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not accept this invite.");
    } finally { setBusy(false); }
  }, [busy, code, invite, router, session, source]);

  useEffect(() => {
    if (!session || action !== "accept" || !invite || !code) return;
    const key = `${session.user.id}:${code}`;
    if (handledAccept.current === key) return;
    handledAccept.current = key;
    void accept();
  }, [accept, action, code, invite, session]);

  if (loading) return <Screen contentStyle={styles.centered}><ActivityIndicator color={colors.hot} /></Screen>;
  if (!invite) return <Screen contentStyle={styles.centered}><Eyebrow>INVITE NOT AVAILABLE</Eyebrow><Text style={styles.title}>THIS INVITE CAN’T BE USED.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<PrimaryButton onPress={() => router.replace("/(tabs)/explore")}>EXPLORE DROPS</PrimaryButton></Screen>;

  const inviter = invite.inviter_handle ? `@${invite.inviter_handle}` : invite.inviter_display_name || "A ProofMode member";
  return <Screen>
    <Eyebrow>YOU WERE CALLED OUT</Eyebrow>
    <Text style={styles.emoji}>{invite.cover_emoji || "↗"}</Text>
    <Text style={styles.title}>{invite.challenge_title.toUpperCase()}</Text>
    <Text style={styles.copy}>{inviter} wants you in. {invite.challenge_tagline || invite.challenge_rule}</Text>
    <Surface style={styles.rule}><Text style={styles.ruleLabel}>THE RULE</Text><Text style={styles.ruleText}>{invite.challenge_rule}</Text><Text style={styles.meta}>{invite.challenge_duration_days} DAYS · {invite.challenge_format.toUpperCase()}</Text></Surface>
    <PrimaryButton onPress={busy ? undefined : () => void accept()}>{busy ? "JOINING…" : session ? "ACCEPT + JOIN" : "SIGN IN + ACCEPT"}</PrimaryButton>
    <PrimaryButton style={styles.secondary} textStyle={styles.secondaryText} onPress={() => router.push(`/challenge/${invite.challenge_slug}`)}>VIEW DROP</PrimaryButton>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: "center", gap: spacing.md },
  emoji: { fontSize: 48, marginTop: spacing.xl },
  title: { color: colors.text, fontSize: 42, lineHeight: 40, fontWeight: "900", letterSpacing: -2.3, marginTop: spacing.sm },
  copy: { color: colors.muted, fontSize: 17, lineHeight: 24, marginTop: spacing.md },
  rule: { padding: spacing.lg, marginVertical: spacing.xl },
  ruleLabel: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  ruleText: { color: colors.text, fontSize: 18, lineHeight: 26, fontWeight: "800", marginTop: spacing.sm },
  meta: { color: colors.muted, fontSize: 10, fontWeight: "900", marginTop: spacing.md },
  secondary: { backgroundColor: colors.panel2, borderColor: colors.line, borderWidth: 1, marginTop: spacing.sm },
  secondaryText: { color: colors.text },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.md },
});
