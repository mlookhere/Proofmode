import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { requireApiUrl } from "@/config/env";
import type { PostMode } from "@/domain";
import { requireSupabase } from "@/lib/supabase";

const PENDING_UPLOAD_PREFIX = "proofmode.pending-media-upload.v3";
const LEGACY_PENDING_UPLOAD_V2_PREFIX = "proofmode.pending-media-upload.v2";
const LEGACY_PENDING_UPLOAD_KEY = "proofmode.pending-media-upload.v1";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 120;

export type MediaKind = "image" | "video";

export type SelectedMedia = Readonly<{
  uri: string;
  mediaKind: MediaKind;
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  fileName: string;
}>;

export type UploadDraft = Readonly<{
  challengeId: string;
  kind: PostMode["title"];
  caption: string;
  media: SelectedMedia;
  resetToken: string | null;
}>;

export type PendingUpload = Readonly<{
  version: 3;
  userId: string;
  mediaId: string;
  postId: string;
  challengeId: string;
  kind: PostMode["title"];
  caption: string;
  media: SelectedMedia;
  resetToken: string | null;
}>;

type LegacyPendingUploadV2 = Omit<PendingUpload, "version" | "resetToken"> & { version: 2 };

type UploadIntent = Readonly<{
  mediaId: string;
  postId: string;
  journeyId: string;
  provider: "r2" | "stream";
  alreadyUploaded?: boolean;
  uploadUrl?: string;
  method?: "PUT" | "POST";
  headers?: Record<string, string>;
}>;

export function createResetToken() {
  const random = `${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
  return `reset-${Date.now()}-${random}`;
}

function pendingDirectory() {
  if (!FileSystem.documentDirectory) throw new Error("Persistent app storage is unavailable.");
  return `${FileSystem.documentDirectory}proofmode-pending/`;
}

function pendingUploadKey(userId: string) {
  return `${PENDING_UPLOAD_PREFIX}.${userId}`;
}

function legacyPendingUploadV2Key(userId: string) {
  return `${LEGACY_PENDING_UPLOAD_V2_PREFIX}.${userId}`;
}

async function session() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error("Sign in again before uploading.");
  return data.session;
}

async function accessToken() {
  return (await session()).access_token;
}

async function api(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const response = await fetch(`${requireApiUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Media request failed (${response.status}).`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function extensionForMime(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "video/quicktime") return "mov";
  return "mp4";
}

export async function persistSelectedMedia(media: Omit<SelectedMedia, "uri" | "fileName"> & { uri: string; fileName?: string | null }) {
  const directory = pendingDirectory();
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extensionForMime(media.mimeType)}`;
  const destination = `${directory}${fileName}`;
  await FileSystem.copyAsync({ from: media.uri, to: destination });
  return { ...media, uri: destination, fileName } satisfies SelectedMedia;
}

export async function removePersistedMedia(uri: string) {
  if (FileSystem.documentDirectory && uri.startsWith(pendingDirectory())) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

export async function createUploadIntent(draft: UploadDraft, resumeMediaId: string | null = null): Promise<UploadIntent> {
  return api("/api/media/upload-intent", {
    method: "POST",
    body: JSON.stringify({
      challengeId: draft.challengeId,
      kind: draft.kind,
      caption: draft.caption,
      mediaKind: draft.media.mediaKind,
      mimeType: draft.media.mimeType,
      bytes: draft.media.bytes,
      width: draft.media.width,
      height: draft.media.height,
      durationSeconds: draft.media.durationSeconds,
      resetToken: draft.resetToken,
      resumeMediaId,
    }),
  }) as Promise<UploadIntent>;
}

export async function discardUploadIntent(mediaId: string) {
  await api(`/api/media/assets/${encodeURIComponent(mediaId)}`, { method: "DELETE" });
}

export async function savePendingUpload(draft: UploadDraft, intent: UploadIntent) {
  const userId = (await session()).user.id;
  const pending: PendingUpload = {
    version: 3,
    userId,
    mediaId: intent.mediaId,
    postId: intent.postId,
    challengeId: draft.challengeId,
    kind: draft.kind,
    caption: draft.caption,
    media: draft.media,
    resetToken: draft.resetToken,
  };
  await AsyncStorage.setItem(pendingUploadKey(userId), JSON.stringify(pending));
  return pending;
}

async function loadLegacyV2(userId: string): Promise<PendingUpload | null> {
  const key = legacyPendingUploadV2Key(userId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    const legacy = JSON.parse(raw) as LegacyPendingUploadV2;
    if (legacy.version !== 2 || legacy.userId !== userId || !legacy.mediaId || !legacy.media?.uri) throw new Error("invalid");
    const info = await FileSystem.getInfoAsync(legacy.media.uri);
    if (!info.exists) throw new Error("missing media");
    const pending: PendingUpload = {
      ...legacy,
      version: 3,
      resetToken: legacy.kind === "reset" ? createResetToken() : null,
    };
    await AsyncStorage.setItem(pendingUploadKey(userId), JSON.stringify(pending));
    await AsyncStorage.removeItem(key);
    return pending;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function loadPendingUpload(): Promise<PendingUpload | null> {
  const userId = (await session()).user.id;
  const legacy = await AsyncStorage.getItem(LEGACY_PENDING_UPLOAD_KEY);
  if (legacy) {
    try {
      const parsed = JSON.parse(legacy) as { media?: { uri?: string } };
      if (parsed.media?.uri) await removePersistedMedia(parsed.media.uri);
    } catch {}
    await AsyncStorage.removeItem(LEGACY_PENDING_UPLOAD_KEY);
  }

  const key = pendingUploadKey(userId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return loadLegacyV2(userId);
  try {
    const pending = JSON.parse(raw) as PendingUpload;
    if (pending.version !== 3 || pending.userId !== userId || !pending.mediaId || !pending.media?.uri) throw new Error("invalid");
    const info = await FileSystem.getInfoAsync(pending.media.uri);
    if (!info.exists) {
      await AsyncStorage.removeItem(key);
      return null;
    }
    return pending;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

export async function clearPendingUpload(pending: PendingUpload) {
  await AsyncStorage.removeItem(pendingUploadKey(pending.userId));
  await removePersistedMedia(pending.media.uri);
}

export async function uploadToProvider(
  media: SelectedMedia,
  intent: UploadIntent,
  onProgress: (progress: number) => void,
) {
  if (intent.alreadyUploaded) {
    onProgress(1);
    return;
  }
  if (!intent.uploadUrl || !intent.method) throw new Error("Upload intent is incomplete.");

  const task = FileSystem.createUploadTask(
    intent.uploadUrl,
    media.uri,
    intent.provider === "r2"
      ? {
          httpMethod: "PUT",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: intent.headers || { "Content-Type": media.mimeType },
        }
      : {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
          fieldName: "file",
          mimeType: media.mimeType,
        },
    ({ totalBytesExpectedToSend, totalBytesSent }) => {
      if (totalBytesExpectedToSend > 0) onProgress(Math.min(1, totalBytesSent / totalBytesExpectedToSend));
    },
  );

  const result = await task.uploadAsync();
  if (!result || result.status < 200 || result.status >= 300) {
    throw new Error(`Upload failed${result ? ` (${result.status})` : ""}.`);
  }
  onProgress(1);
}

export async function finalizeUpload(mediaId: string) {
  return api("/api/media/finalize", {
    method: "POST",
    body: JSON.stringify({ mediaId }),
  }) as Promise<{ postId: string; status: string; moderationStatus: string }>;
}

export async function retryPendingUpload(pending: PendingUpload, onProgress: (progress: number) => void) {
  const currentUserId = (await session()).user.id;
  if (pending.userId !== currentUserId) throw new Error("This interrupted upload belongs to a different account.");
  const draft: UploadDraft = {
    challengeId: pending.challengeId,
    kind: pending.kind,
    caption: pending.caption,
    media: pending.media,
    resetToken: pending.resetToken,
  };
  const intent = await createUploadIntent(draft, pending.mediaId);
  await uploadToProvider(pending.media, intent, onProgress);
  return finalizeUpload(pending.mediaId);
}

export async function discardPendingUpload(pending: PendingUpload) {
  const currentUserId = (await session()).user.id;
  if (pending.userId !== currentUserId) throw new Error("This interrupted upload belongs to a different account.");
  await discardUploadIntent(pending.mediaId);
  await clearPendingUpload(pending);
}
