import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  createCrewInvite,
  deleteCrewMessage,
  fetchCrewRoom,
  postCrewMessage,
  type CrewRoom,
} from "@/api/social";
import { useAuth } from "@/auth/session";
import { Eyebrow, PrimaryButton, Screen, Surface } from "@/components/ui";
import { colors, radius, spacing } from "@/theme";

function shortDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
}

export default function CrewRoomScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, isLoading: isSessionLoading } = useAuth();
  const [room, setRoom] = useState<CrewRoom | null>(null);
  const [message, setMessage] = useState("");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !id) return;
    setIsLoading(true);
    setError(null);
    try {
      setRoom(await fetchCrewRoom(id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load this Crew.");
    } finally {
      setIsLoading(false);
    }
  }, [id, session]);

  useEffect(() => {
    if (!isSessionLoading && !session) router.replace("/auth");
  }, [isSessionLoading, router, session]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sendMessage() {
    const body = message.trim();
    if (!room || !body || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      await postCrewMessage(room.id, body);
      setMessage("");
      setRoom(await fetchCrewRoom(room.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not post message.");
    } finally {
      setIsMutating(false);
    }
  }

  async function removeMessage(messageId: string) {
    if (!room || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      if (await deleteCrewMessage(messageId)) setRoom(await fetchCrewRoom(room.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete message.");
    } finally {
      setIsMutating(false);
    }
  }

  async function makeInvite() {
    if (!room || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      setInviteCode(await createCrewInvite(room.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create invite.");
    } finally {
      setIsMutating(false);
    }
  }

  if (isSessionLoading || isLoading) {
    return <Screen contentStyle={styles.centered}><ActivityIndicator color={colors.hot} /></Screen>;
  }

  if (!session) return <Screen />;

  if (!room) {
    return (
      <Screen contentStyle={styles.centered}>
        <Eyebrow>CREW UNAVAILABLE</Eyebrow>
        <Text style={styles.title}>THIS ROOM ISN’T AVAILABLE.</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton onPress={() => router.replace("/(tabs)/crews")}>BACK TO CREWS</PrimaryButton>
      </Screen>
    );
  }

  return (
    <Screen>
      <Eyebrow>PRIVATE CREW</Eyebrow>
      <Text style={styles.emoji}>{room.cover_emoji ?? "◉"}</Text>
      <Text style={styles.title}>{room.title.toUpperCase()}</Text>
      <Text style={styles.rule}>{room.rule}</Text>
      <Text style={styles.memberCount}>{room.member_count.toLocaleString()} MEMBERS</Text>

      <Text style={styles.section}>LEADERBOARD</Text>
      <Surface style={styles.panel}>
        {room.leaderboard.length === 0 ? <Text style={styles.empty}>No proof activity yet.</Text> : null}
        {room.leaderboard.map((member) => (
          <View key={member.user_id} style={styles.row}>
            <Text style={styles.rank}>#{member.rank}</Text>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{member.display_name}</Text>
              <Text style={styles.rowMeta}>{member.handle ? `@${member.handle} · ` : ""}{member.receipts} RECEIPTS</Text>
            </View>
            <Text style={styles.score}>{member.proof_score}</Text>
          </View>
        ))}
      </Surface>

      <Text style={styles.section}>MEMBERS</Text>
      <Surface style={styles.panel}>
        {room.members.map((member) => (
          <View key={member.user_id} style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowTitle}>{member.display_name}</Text>
              <Text style={styles.rowMeta}>{member.handle ? `@${member.handle} · ` : ""}{member.role.toUpperCase()}{member.founder ? " · FOUNDER" : ""}</Text>
            </View>
          </View>
        ))}
      </Surface>

      <Text style={styles.section}>RECENT ACTIVITY</Text>
      <Surface style={styles.panel}>
        {room.recent_activity.length === 0 ? <Text style={styles.empty}>No recent Crew posts yet.</Text> : null}
        {room.recent_activity.map((activity) => (
          <View key={activity.post_id} style={styles.activity}>
            <Text style={styles.rowMeta}>{activity.display_name} · {activity.kind.toUpperCase()} · {shortDate(activity.published_at)}</Text>
            <Text style={styles.activityText}>{activity.caption?.trim() || "Proof posted."}</Text>
          </View>
        ))}
      </Surface>

      <Text style={styles.section}>ROOM THREAD</Text>
      <Surface style={styles.panel}>
        {room.messages.length === 0 ? <Text style={styles.empty}>Start the Crew check-in.</Text> : null}
        {room.messages.map((item) => (
          <View key={item.message_id} style={styles.message}>
            <View style={styles.messageHead}>
              <Text style={styles.rowMeta}>{item.display_name}{item.handle ? ` · @${item.handle}` : ""} · {shortDate(item.created_at)}</Text>
              {item.is_own ? (
                <Pressable accessibilityRole="button" onPress={() => void removeMessage(item.message_id)}><Text style={styles.delete}>DELETE</Text></Pressable>
              ) : null}
            </View>
            <Text style={styles.activityText}>{item.body}</Text>
          </View>
        ))}
      </Surface>

      <View style={styles.composer}>
        <TextInput
          maxLength={500}
          multiline
          onChangeText={setMessage}
          placeholder="Crew check-in"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={message}
        />
        <Pressable accessibilityRole="button" disabled={!message.trim() || isMutating} onPress={() => void sendMessage()} style={styles.send}>
          <Text style={styles.sendText}>POST</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>INVITE</Text>
      <PrimaryButton onPress={isMutating ? undefined : () => void makeInvite()}>CREATE INVITE CODE</PrimaryButton>
      {inviteCode ? <Text selectable style={styles.invite}>INVITE CODE · {inviteCode}</Text> : null}

      {isMutating ? <ActivityIndicator color={colors.hot} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: "center", gap: spacing.md },
  emoji: { fontSize: 42, marginTop: spacing.xl },
  title: { color: colors.text, fontSize: 42, lineHeight: 41, fontWeight: "900", letterSpacing: -2.2, marginTop: spacing.sm },
  rule: { color: colors.muted, fontSize: 16, lineHeight: 23, marginTop: spacing.md },
  memberCount: { color: colors.hot, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: spacing.md },
  section: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  panel: { padding: spacing.md },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  rank: { color: colors.hot, fontSize: 14, fontWeight: "900", width: 34 },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  rowMeta: { color: colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 0.5, marginTop: 2 },
  score: { color: colors.text, fontSize: 18, fontWeight: "900" },
  activity: { paddingVertical: spacing.sm, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  activityText: { color: colors.text, lineHeight: 21, marginTop: spacing.xs },
  message: { paddingVertical: spacing.sm, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  messageHead: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  delete: { color: colors.danger, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 },
  empty: { color: colors.muted, paddingVertical: spacing.sm },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, marginTop: spacing.md },
  input: { flex: 1, minHeight: 46, maxHeight: 110, color: colors.text, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  send: { backgroundColor: colors.hot, borderRadius: radius.pill, paddingHorizontal: 18, paddingVertical: 13 },
  sendText: { color: colors.bg, fontSize: 11, fontWeight: "900" },
  invite: { color: colors.text, backgroundColor: colors.panel2, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm, fontWeight: "900" },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.md },
});
