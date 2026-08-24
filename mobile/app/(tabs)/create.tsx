import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { fetchJoinedPublicChallenges, type PublicChallenge } from "@/api/challenges";
import {
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  clearPendingUpload,
  createResetToken,
  createUploadIntent,
  discardPendingUpload,
  finalizeUpload,
  loadPendingUpload,
  persistSelectedMedia,
  removePersistedMedia,
  retryPendingUpload,
  savePendingUpload,
  uploadToProvider,
  type PendingUpload,
  type SelectedMedia,
  type UploadDraft,
} from "@/api/media";
import { useAuth } from "@/auth/session";
import { AuthRequired } from "@/components/auth-required";
import { Eyebrow, Screen } from "@/components/ui";
import { postModes } from "@/data";
import type { PostMode } from "@/domain";
import { colors, radius, spacing } from "@/theme";

function bytesLabel(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function inferMimeType(asset: ImagePicker.ImagePickerAsset, mediaKind: "image" | "video") {
  if (asset.mimeType) return asset.mimeType.toLowerCase();
  const name = (asset.fileName || asset.uri).toLowerCase();
  if (mediaKind === "image") {
    if (name.endsWith(".png")) return "image/png";
    if (name.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }
  return name.endsWith(".mov") ? "video/quicktime" : "video/mp4";
}

async function normalizeAsset(asset: ImagePicker.ImagePickerAsset): Promise<SelectedMedia> {
  const mediaKind = asset.type === "video" ? "video" : "image";
  const mimeType = inferMimeType(asset, mediaKind);
  let bytes = asset.fileSize ?? 0;
  if (!bytes) {
    const info = await FileSystem.getInfoAsync(asset.uri);
    bytes = info.exists && "size" in info ? info.size : 0;
  }
  if (!bytes) throw new Error("Could not read the selected file size.");

  const durationSeconds = mediaKind === "video" && asset.duration !== null && asset.duration !== undefined
    ? asset.duration / 1000
    : null;
  if (mediaKind === "image" && bytes > MAX_IMAGE_BYTES) throw new Error("Images must be 20 MB or smaller.");
  if (mediaKind === "video") {
    if (bytes > MAX_VIDEO_BYTES) throw new Error("Videos must be 200 MB or smaller.");
    if (durationSeconds === null) throw new Error("Could not read the selected video duration.");
    if (durationSeconds > MAX_VIDEO_SECONDS) throw new Error("Videos must be 120 seconds or shorter.");
  }

  return persistSelectedMedia({
    uri: asset.uri,
    mediaKind,
    mimeType,
    bytes,
    width: asset.width || null,
    height: asset.height || null,
    durationSeconds,
    fileName: asset.fileName,
  });
}

function completionMessage(status: string) {
  if (status === "processing") return "Video uploaded. ProofMode is processing it now.";
  if (status === "moderation_pending") return "Upload complete. Your proof is waiting for review.";
  if (status === "published") return "Published.";
  return "Upload received. ProofMode is finishing it now.";
}

export default function Create() {
  const { session, isLoading } = useAuth();
  const userId = session?.user.id ?? null;
  const [mode, setMode] = useState<PostMode["title"]>("proof");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<readonly PublicChallenge[]>([]);
  const [challengeId, setChallengeId] = useState("");
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<SelectedMedia | null>(null);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loadingChallenges, setLoadingChallenges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    setChallenges([]);
    setChallengeId("");
    setCaption("");
    setResetToken(null);
    setMedia((current) => {
      if (current) void removePersistedMedia(current.uri);
      return null;
    });
    setPending(null);
    setProgress(0);
    setError(null);
    setStatus(null);
    setLoadingChallenges(true);

    Promise.all([fetchJoinedPublicChallenges(userId), loadPendingUpload()])
      .then(([joined, interrupted]) => {
        if (!active) return;
        setChallenges(joined);
        setChallengeId(joined[0]?.id || "");
        setPending(interrupted);
      })
      .catch((cause) => active && setError(cause instanceof Error ? cause.message : "Could not load posting options."))
      .finally(() => active && setLoadingChallenges(false));
    return () => { active = false; };
  }, [userId]);

  if (isLoading) return <Screen />;
  if (!session) return <AuthRequired title="POST YOUR PROOF." message="Sign in when you are ready to publish. Browsing stays open without an account." />;

  async function chooseMedia(source: "camera" | "library") {
    if (pending || busy) return;
    setError(null);
    setStatus(null);

    try {
      if (source === "camera") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) throw new Error("Camera permission is required to capture proof media.");
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) throw new Error("Photo library permission is required to choose proof media.");
      }

      const result = source === "camera"
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images", "videos"], videoMaxDuration: MAX_VIDEO_SECONDS, quality: 1 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images", "videos"], quality: 1 });
      if (result.canceled || !result.assets[0]) return;

      const next = await normalizeAsset(result.assets[0]);
      if (media) await removePersistedMedia(media.uri);
      setMedia(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not select media.");
    }
  }

  async function publish() {
    if (!media || !challengeId || busy || pending) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    setStatus(null);

    const nextResetToken = mode === "reset" ? (resetToken ?? createResetToken()) : null;
    if (mode === "reset" && !resetToken) setResetToken(nextResetToken);
    const draft: UploadDraft = { challengeId, kind: mode, caption: caption.trim(), media, resetToken: nextResetToken };
    let interrupted: PendingUpload | null = null;
    try {
      const intent = await createUploadIntent(draft);
      interrupted = await savePendingUpload(draft, intent);
      setPending(interrupted);
      await uploadToProvider(media, intent, setProgress);
      const result = await finalizeUpload(intent.mediaId);
      await clearPendingUpload(interrupted);
      setPending(null);
      setMedia(null);
      setCaption("");
      setResetToken(null);
      setProgress(0);
      setStatus(completionMessage(result.status));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed. You can retry without rebuilding the post.");
      if (interrupted) setPending(interrupted);
    } finally {
      setBusy(false);
    }
  }

  async function retry() {
    if (!pending || busy) return;
    setBusy(true);
    setProgress(0);
    setError(null);
    try {
      const result = await retryPendingUpload(pending, setProgress);
      await clearPendingUpload(pending);
      setPending(null);
      setMedia(null);
      setResetToken(null);
      setProgress(0);
      setStatus(completionMessage(result.status));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Retry failed. Your draft is still saved.");
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    if (!pending || busy) return;
    setBusy(true);
    setError(null);
    try {
      await discardPendingUpload(pending);
      setPending(null);
      setResetToken(null);
      setProgress(0);
      setStatus("Interrupted upload discarded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not discard the upload yet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Eyebrow>POST WITHOUT PRETENDING</Eyebrow>
      <Text style={styles.h1}>WHAT{"\n"}HAPPENED?</Text>
      <Text style={styles.lede}>Pick the honest version, attach what happened, and send it to a Drop you joined.</Text>

      {pending ? (
        <View style={styles.recovery}>
          <Text style={styles.sectionTitle}>INTERRUPTED UPLOAD</Text>
          <Text style={styles.help}>{pending.media.mediaKind.toUpperCase()} · {bytesLabel(pending.media.bytes)}</Text>
          {busy && <Progress value={progress} />}
          <View style={styles.row}>
            <Pressable accessibilityRole="button" disabled={busy} style={[styles.primarySmall, busy && styles.disabled]} onPress={() => void retry()}>
              <Text style={styles.primaryText}>RETRY</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={busy} style={styles.secondarySmall} onPress={() => void discard()}>
              <Text style={styles.secondaryText}>DISCARD</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle}>1. STORY</Text>
          <View style={styles.modeGrid}>
            {postModes.map((item) => (
              <Pressable
                key={item.title}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === item.title }}
                onPress={() => {
                  setMode(item.title);
                  setResetToken(item.title === "reset" ? createResetToken() : null);
                }}
                style={[styles.mode, mode === item.title && styles.modeSelected]}
              >
                <Text style={styles.modeIcon}>{item.icon}</Text>
                <Text style={styles.modeTitle}>{item.title.toUpperCase()}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.sectionTitle}>2. DROP</Text>
          {loadingChallenges ? <ActivityIndicator color={colors.hot} /> : challenges.length === 0 ? (
            <Text style={styles.help}>Join a public Drop in Explore before posting.</Text>
          ) : challenges.map((challenge) => (
            <Pressable
              key={challenge.id}
              accessibilityRole="button"
              accessibilityState={{ selected: challengeId === challenge.id }}
              onPress={() => {
                if (challengeId !== challenge.id && mode === "reset") setResetToken(createResetToken());
                setChallengeId(challenge.id);
              }}
              style={[styles.challenge, challengeId === challenge.id && styles.challengeSelected]}
            >
              <Text style={styles.challengeEmoji}>{challenge.coverEmoji || "✓"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.challengeTitle}>{challenge.title}</Text>
                <Text style={styles.help} numberOfLines={1}>{challenge.rule}</Text>
              </View>
            </Pressable>
          ))}

          <Text style={styles.sectionTitle}>3. MEDIA</Text>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" style={styles.secondarySmall} onPress={() => void chooseMedia("camera")}>
              <Text style={styles.secondaryText}>CAMERA</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.secondarySmall} onPress={() => void chooseMedia("library")}>
              <Text style={styles.secondaryText}>LIBRARY</Text>
            </Pressable>
          </View>
          {media && (
            <View style={styles.mediaSummary}>
              <Text style={styles.mediaTitle}>{media.mediaKind.toUpperCase()} READY</Text>
              <Text style={styles.help}>{bytesLabel(media.bytes)}{media.durationSeconds !== null ? ` · ${Math.ceil(media.durationSeconds)}s` : ""}</Text>
              <Pressable accessibilityRole="button" onPress={() => { void removePersistedMedia(media.uri); setMedia(null); }}>
                <Text style={styles.remove}>REMOVE</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.sectionTitle}>4. CAPTION</Text>
          <TextInput
            value={caption}
            onChangeText={setCaption}
            maxLength={1000}
            multiline
            placeholder="What happened?"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          {busy && <Progress value={progress} />}
          <Pressable
            accessibilityRole="button"
            disabled={busy || !media || !challengeId}
            onPress={() => void publish()}
            style={[styles.publish, (busy || !media || !challengeId) && styles.disabled]}
          >
            {busy ? <ActivityIndicator color={colors.bg} /> : <Text style={styles.primaryText}>POST {mode.toUpperCase()}</Text>}
          </Pressable>
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {status && <Text style={styles.status}>{status}</Text>}
    </Screen>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.round(value * 100)}%` }]} />
      <Text style={styles.progressText}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { color: colors.text, fontSize: 58, lineHeight: 52, fontWeight: "900", letterSpacing: -3.5, marginTop: 10 },
  lede: { color: colors.muted, lineHeight: 21, marginVertical: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 11, fontWeight: "900", letterSpacing: 1.2, marginTop: spacing.lg, marginBottom: spacing.sm },
  modeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mode: { minWidth: "30%", flexGrow: 1, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: 12, alignItems: "center", gap: 5 },
  modeSelected: { borderColor: colors.hot, backgroundColor: colors.panel2 },
  modeIcon: { color: colors.hot, fontSize: 20, fontWeight: "900" },
  modeTitle: { color: colors.text, fontSize: 11, fontWeight: "900" },
  challenge: { backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: 13, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 11 },
  challengeSelected: { borderColor: colors.hot },
  challengeEmoji: { fontSize: 22 },
  challengeTitle: { color: colors.text, fontWeight: "900" },
  help: { color: colors.muted, marginTop: 3 },
  row: { flexDirection: "row", gap: 9 },
  secondarySmall: { flex: 1, minHeight: 46, borderRadius: radius.pill, borderColor: colors.line, borderWidth: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.panel },
  secondaryText: { color: colors.text, fontWeight: "900" },
  primarySmall: { flex: 1, minHeight: 46, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.hot },
  primaryText: { color: colors.bg, fontWeight: "900", letterSpacing: 0.4 },
  mediaSummary: { marginTop: 10, backgroundColor: colors.panel2, borderRadius: radius.md, padding: 13, borderWidth: 1, borderColor: colors.line },
  mediaTitle: { color: colors.text, fontWeight: "900" },
  remove: { color: colors.danger, fontWeight: "900", marginTop: 10 },
  input: { minHeight: 112, color: colors.text, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: 14, textAlignVertical: "top" },
  publish: { minHeight: 54, marginTop: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.hot, alignItems: "center", justifyContent: "center" },
  disabled: { opacity: 0.45 },
  error: { color: colors.danger, lineHeight: 20, marginTop: spacing.md },
  status: { color: colors.hot, lineHeight: 20, marginTop: spacing.md, fontWeight: "800" },
  recovery: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.orange, borderRadius: radius.lg, padding: 16, marginBottom: spacing.lg },
  progressTrack: { height: 34, marginTop: spacing.md, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.panel2, justifyContent: "center" },
  progressFill: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: colors.hot },
  progressText: { color: colors.text, textAlign: "center", fontWeight: "900", fontSize: 11 },
});
