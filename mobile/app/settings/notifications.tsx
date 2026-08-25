import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/auth/session";
import {
  fetchNotificationPreferences,
  saveNotificationPreferences,
  type NotificationPreferences,
} from "@/api/notifications";
import { AuthRequired } from "@/components/auth-required";
import { PrimaryButton, Screen, Surface } from "@/components/ui";
import { usePushNotifications } from "@/notifications/runtime";
import { colors, radius, spacing } from "@/theme";

type ToggleKey = "social" | "drop_updates" | "streak_risk" | "crew_position" | "journey_updates" | "invites";

const rows: readonly Readonly<{ key: ToggleKey; title: string; detail: string }>[] = [
  { key: "social", title: "SOCIAL", detail: "Follows, reactions, and comments that point back to real activity." },
  { key: "drop_updates", title: "DROP UPDATES", detail: "When a Drop you joined or watch starts or ends." },
  { key: "streak_risk", title: "STREAK RISK", detail: "A late-day alert only when one proof can preserve an active streak." },
  { key: "crew_position", title: "CREW POSITION", detail: "When one verified proof can move you up a Crew leaderboard position." },
  { key: "journey_updates", title: "JOURNEY UPDATES", detail: "New chapters from Journeys you explicitly follow." },
  { key: "invites", title: "INVITES", detail: "When someone accepts an invite you created." },
] as const;

function normalizeTime(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function validTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function pushStatusCopy(status: ReturnType<typeof usePushNotifications>["status"]) {
  switch (status) {
    case "registered": return "This device is registered for ProofMode push notifications.";
    case "registering": return "Registering this device…";
    case "not_granted": return "Device push is off. ProofMode will only ask for permission when you press Enable Device Push.";
    case "not_configured": return "This build does not have an EAS project ID yet, so it cannot obtain an Expo Push Token.";
    case "account_mismatch": return "This device token is still associated with another signed-in account. Sign out there before switching accounts.";
    case "unsupported": return "Remote push registration is available on the native iOS and Android apps.";
    case "error": return "This device could not be registered for push.";
    default: return "ProofMode does not ask for notification permission during cold onboarding.";
  }
}

function PreferenceRow({
  title,
  detail,
  value,
  disabled,
  onValueChange,
}: Readonly<{
  title: string;
  detail: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}>) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceCopy}>
        <Text style={styles.preferenceTitle}>{title}</Text>
        <Text style={styles.preferenceDetail}>{detail}</Text>
      </View>
      <Switch disabled={disabled} value={value} onValueChange={onValueChange} />
    </View>
  );
}

export default function NotificationSettings() {
  const router = useRouter();
  const { session, isLoading: isSessionLoading } = useAuth();
  const push = usePushNotifications();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setIsLoading(true);
    setError(null);
    try {
      const next = await fetchNotificationPreferences();
      setPreferences(next);
      setQuietStart(normalizeTime(next.quiet_hours_start));
      setQuietEnd(normalizeTime(next.quiet_hours_end));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load notification settings.");
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => { void load(); }, [load]);

  function setToggle(key: ToggleKey, value: boolean) {
    setSaved(false);
    setPreferences((current) => current ? { ...current, [key]: value } : current);
  }

  async function save() {
    if (!preferences || isSaving) return;
    const start = quietStart.trim();
    const end = quietEnd.trim();
    if ((start && !end) || (!start && end)) {
      setError("Quiet hours need both a start and end time, or leave both blank.");
      return;
    }
    if ((start && !validTime(start)) || (end && !validTime(end))) {
      setError("Use 24-hour quiet times like 22:00 and 07:00.");
      return;
    }

    setIsSaving(true);
    setSaved(false);
    setError(null);
    try {
      const next = await saveNotificationPreferences({
        social: preferences.social,
        dropUpdates: preferences.drop_updates,
        streakRisk: preferences.streak_risk,
        crewPosition: preferences.crew_position,
        journeyUpdates: preferences.journey_updates,
        invites: preferences.invites,
        quietHoursStart: start || null,
        quietHoursEnd: end || null,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || preferences.timezone || "UTC",
      });
      setPreferences(next);
      setQuietStart(normalizeTime(next.quiet_hours_start));
      setQuietEnd(normalizeTime(next.quiet_hours_end));
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save notification settings.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isSessionLoading) return <Screen />;
  if (!session) return <AuthRequired title="NOTIFICATION SETTINGS" message="Sign in to choose which ProofMode stakes can reach this device." />;

  return (
    <Screen>
      <Pressable accessibilityRole="button" onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← BACK</Text>
      </Pressable>
      <Text style={styles.eyebrow}>SETTINGS</Text>
      <Text style={styles.title}>NOTIFICATIONS</Text>
      <Text style={styles.intro}>ProofMode only uses push for activity and stakes tied to what you actually follow, joined, or earned. Each class is independent.</Text>

      <Text style={styles.sectionLabel}>DEVICE PUSH</Text>
      <Surface style={styles.deviceCard}>
        <Text style={styles.preferenceTitle}>{push.status === "registered" ? "ENABLED" : "OFF UNTIL YOU ENABLE IT"}</Text>
        <Text style={styles.preferenceDetail}>{pushStatusCopy(push.status)}</Text>
        {push.error ? <Text style={styles.error}>{push.error}</Text> : null}
        {push.status !== "registered" && push.status !== "unsupported" ? (
          <View style={styles.deviceAction}>
            <PrimaryButton onPress={() => void push.enable()}>{push.status === "registering" ? "REGISTERING…" : "ENABLE DEVICE PUSH"}</PrimaryButton>
          </View>
        ) : null}
      </Surface>

      {isLoading && !preferences ? <ActivityIndicator color={colors.hot} style={styles.loader} /> : null}
      {preferences ? (
        <>
          <Text style={styles.sectionLabel}>WHAT CAN REACH YOU</Text>
          <Surface style={styles.list}>
            {rows.map((row) => (
              <PreferenceRow
                key={row.key}
                title={row.title}
                detail={row.detail}
                value={preferences[row.key]}
                disabled={isSaving}
                onValueChange={(value) => setToggle(row.key, value)}
              />
            ))}
          </Surface>

          <Text style={styles.sectionLabel}>QUIET HOURS</Text>
          <Surface style={styles.quietCard}>
            <Text style={styles.preferenceDetail}>Optional. Times use your device timezone. Leave both blank to disable quiet hours.</Text>
            <View style={styles.timeRow}>
              <View style={styles.timeField}>
                <Text style={styles.timeLabel}>START</Text>
                <TextInput
                  autoCapitalize="none"
                  editable={!isSaving}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  onChangeText={(value) => { setSaved(false); setQuietStart(value); }}
                  placeholder="22:00"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={quietStart}
                />
              </View>
              <View style={styles.timeField}>
                <Text style={styles.timeLabel}>END</Text>
                <TextInput
                  autoCapitalize="none"
                  editable={!isSaving}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  onChangeText={(value) => { setSaved(false); setQuietEnd(value); }}
                  placeholder="07:00"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                  value={quietEnd}
                />
              </View>
            </View>
            <Text style={styles.timezone}>{Intl.DateTimeFormat().resolvedOptions().timeZone || preferences.timezone || "UTC"}</Text>
          </Surface>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {saved ? <Text style={styles.saved}>SAVED</Text> : null}
          <PrimaryButton onPress={() => void save()}>{isSaving ? "SAVING…" : "SAVE NOTIFICATIONS"}</PrimaryButton>
        </>
      ) : null}

      {!isLoading && !preferences ? (
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <PrimaryButton onPress={() => void load()}>RETRY</PrimaryButton>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start", marginTop: spacing.sm, paddingVertical: spacing.sm },
  backText: { color: colors.hot, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  eyebrow: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.4, marginTop: spacing.md },
  title: { color: colors.text, fontSize: 34, fontWeight: "900", letterSpacing: -1.5, marginTop: 3 },
  intro: { color: colors.muted, lineHeight: 20, marginTop: spacing.sm, marginBottom: spacing.lg },
  loader: { marginVertical: spacing.xl },
  list: { paddingHorizontal: spacing.md },
  deviceCard: { padding: spacing.md, borderRadius: radius.md },
  deviceAction: { marginTop: spacing.md },
  preferenceRow: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  preferenceCopy: { flex: 1, paddingVertical: spacing.md },
  preferenceTitle: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.7 },
  preferenceDetail: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  sectionLabel: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  quietCard: { padding: spacing.md, borderRadius: radius.md },
  timeRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  timeField: { flex: 1 },
  timeLabel: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  input: { backgroundColor: colors.panel2, borderRadius: radius.md, color: colors.text, fontSize: 18, fontWeight: "800", marginTop: 6, paddingHorizontal: 12, paddingVertical: 11 },
  timezone: { color: colors.muted, fontSize: 10, marginTop: spacing.sm },
  error: { color: colors.danger, lineHeight: 19, marginVertical: spacing.md },
  saved: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginVertical: spacing.md },
});
