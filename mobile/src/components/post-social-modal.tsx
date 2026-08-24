import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  createComment,
  deleteComment,
  fetchPostComments,
  reactionKinds,
  setBlock,
  setPostReaction,
  type PostComment,
  type ReactionKind,
  type ReportTargetType,
} from "@/api/social";
import { useAuth } from "@/auth/session";
import { ReportModal } from "@/components/report-modal";
import { colors, radius, spacing } from "@/theme";

type ReportTarget = { type: ReportTargetType; id: string } | null;

type PostSocialModalProps = {
  visible: boolean;
  postId: string;
  authorId: string;
  authorName: string;
  reaction: ReactionKind | null;
  onClose: () => void;
  onReactionChanged: (reaction: ReactionKind | null, countDelta: number) => void;
  onCommentCountChanged: (delta: number) => void;
  onBlocked: (userId: string) => void;
};

const reactionLabels: Record<ReactionKind, string> = {
  proven: "PROVEN",
  respect: "RESPECT",
  lol: "LOL",
  run_it_back: "RUN IT BACK",
  im_next: "I'M NEXT",
};

export function PostSocialModal({
  visible,
  postId,
  authorId,
  authorName,
  reaction,
  onClose,
  onReactionChanged,
  onCommentCountChanged,
  onBlocked,
}: PostSocialModalProps) {
  const router = useRouter();
  const { session } = useAuth();
  const [comments, setComments] = useState<readonly PostComment[]>([]);
  const [body, setBody] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportTarget>(null);
  const isOwnPost = session?.user.id === authorId;

  const loadComments = useCallback(async () => {
    if (!visible) return;
    setIsLoading(true);
    setError(null);
    try {
      setComments(await fetchPostComments(postId));
    } catch {
      setError("Could not load comments.");
    } finally {
      setIsLoading(false);
    }
  }, [postId, visible]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  function requireAuth() {
    if (session) return true;
    onClose();
    router.push("/auth");
    return false;
  }

  async function react(next: ReactionKind) {
    if (!requireAuth() || isMutating) return;
    const target = reaction === next ? null : next;
    setIsMutating(true);
    setError(null);
    try {
      const persisted = await setPostReaction(postId, target);
      const delta = reaction ? (persisted ? 0 : -1) : persisted ? 1 : 0;
      onReactionChanged(persisted, delta);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update reaction.");
    } finally {
      setIsMutating(false);
    }
  }

  async function comment() {
    const cleanBody = body.trim();
    if (!requireAuth() || !cleanBody || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      await createComment(postId, cleanBody);
      setBody("");
      onCommentCountChanged(1);
      setComments(await fetchPostComments(postId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not post comment.");
    } finally {
      setIsMutating(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!session || isMutating) return;
    setIsMutating(true);
    setError(null);
    try {
      if (await deleteComment(commentId)) {
        setComments((current) => current.filter((item) => item.id !== commentId));
        onCommentCountChanged(-1);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete comment.");
    } finally {
      setIsMutating(false);
    }
  }

  function openReport(type: ReportTargetType, id: string) {
    if (!requireAuth()) return;
    setReportTarget({ type, id });
  }

  function blockAuthor() {
    if (!requireAuth() || isOwnPost) return;
    Alert.alert(
      `Block ${authorName}?`,
      "You will stop seeing each other's content and any follow relationship will be removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setIsMutating(true);
              setError(null);
              try {
                await setBlock(authorId, true);
                onBlocked(authorId);
                onClose();
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Could not block user.");
              } finally {
                setIsMutating(false);
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.title}>POST ACTIONS</Text>
            <Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.close}>CLOSE</Text></Pressable>
          </View>

          <Text style={styles.section}>REACTION</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.reactionRow}>
            {reactionKinds.map((kind) => (
              <Pressable
                accessibilityRole="button"
                disabled={isMutating}
                key={kind}
                onPress={() => void react(kind)}
                style={[styles.reaction, reaction === kind && styles.reactionActive]}
              >
                <Text style={[styles.reactionText, reaction === kind && styles.reactionTextActive]}>{reactionLabels[kind]}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.section}>COMMENTS</Text>
          <ScrollView style={styles.comments} contentContainerStyle={styles.commentList}>
            {isLoading ? <ActivityIndicator color={colors.hot} /> : null}
            {!isLoading && comments.length === 0 ? <Text style={styles.empty}>No comments yet.</Text> : null}
            {comments.map((item) => (
              <View key={item.id} style={styles.comment}>
                <Text style={styles.commentAuthor}>{item.displayName}{item.handle ? ` · @${item.handle}` : ""}</Text>
                <Text style={styles.commentBody}>{item.body}</Text>
                <View style={styles.commentActions}>
                  {item.isOwn ? (
                    <Pressable accessibilityRole="button" onPress={() => void removeComment(item.id)}><Text style={styles.smallAction}>DELETE</Text></Pressable>
                  ) : session ? (
                    <Pressable accessibilityRole="button" onPress={() => openReport("comment", item.id)}><Text style={styles.smallAction}>REPORT</Text></Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>

          {session ? (
            <View style={styles.composer}>
              <TextInput
                maxLength={500}
                multiline
                onChangeText={setBody}
                placeholder="Add a comment"
                placeholderTextColor={colors.muted}
                style={styles.input}
                value={body}
              />
              <Pressable accessibilityRole="button" disabled={isMutating || !body.trim()} onPress={() => void comment()} style={styles.send}>
                <Text style={styles.sendText}>POST</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => requireAuth()} style={styles.signIn}>
              <Text style={styles.signInText}>SIGN IN TO COMMENT OR REACT</Text>
            </Pressable>
          )}

          {!isOwnPost && session ? (
            <View style={styles.safety}>
              <Pressable accessibilityRole="button" onPress={() => openReport("post", postId)}><Text style={styles.safetyAction}>REPORT POST</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => openReport("user", authorId)}><Text style={styles.safetyAction}>REPORT USER</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={blockAuthor}><Text style={[styles.safetyAction, styles.danger]}>BLOCK USER</Text></Pressable>
            </View>
          ) : null}

          {isMutating ? <ActivityIndicator color={colors.hot} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </Modal>

      {reportTarget ? (
        <ReportModal
          visible
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          onClose={() => setReportTarget(null)}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 58, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: -0.8 },
  close: { color: colors.hot, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  section: { color: colors.muted, fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginTop: spacing.xl, marginBottom: spacing.sm },
  reactionRow: { gap: spacing.sm, paddingRight: spacing.lg },
  reaction: { borderColor: colors.line, borderWidth: 1, backgroundColor: colors.panel, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 10 },
  reactionActive: { backgroundColor: colors.hot, borderColor: colors.hot },
  reactionText: { color: colors.text, fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  reactionTextActive: { color: colors.bg },
  comments: { flex: 1, marginTop: spacing.sm },
  commentList: { gap: spacing.sm, paddingBottom: spacing.lg },
  empty: { color: colors.muted, paddingVertical: spacing.lg },
  comment: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  commentAuthor: { color: colors.muted, fontSize: 11, fontWeight: "800" },
  commentBody: { color: colors.text, fontSize: 15, lineHeight: 21, marginTop: spacing.xs },
  commentActions: { flexDirection: "row", justifyContent: "flex-end", marginTop: spacing.sm },
  smallAction: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, borderTopColor: colors.line, borderTopWidth: 1, paddingTop: spacing.md },
  input: { flex: 1, minHeight: 44, maxHeight: 100, color: colors.text, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  send: { backgroundColor: colors.hot, borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 12 },
  sendText: { color: colors.bg, fontSize: 11, fontWeight: "900" },
  signIn: { backgroundColor: colors.hot, borderRadius: radius.pill, alignItems: "center", padding: 13 },
  signInText: { color: colors.bg, fontSize: 11, fontWeight: "900" },
  safety: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.lg, marginTop: spacing.md },
  safetyAction: { color: colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 0.9 },
  danger: { color: colors.danger },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.sm },
});
