import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { requireApiUrl } from "@/config/env";
import type { PostMode } from "@/domain";
import { requireSupabase } from "@/lib/supabase";

const PENDING_UPLOAD_KEY = "proofmode.pending-media-upload.v1";

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
}>;

export type PendingUpload = Readonly<{
  version: 1;
  mediaId: string;
  postId: string;
  challengeId: string;
  kind: PostMode["title"];
  caption: string;
  media: SelectedMedia;
}>;

type UploadIntent = Readonly<{
  mediaId: string;
  postId: string;
  provider: "r2" | "stream";
  uploadUrl: string;
  method: "PUT" | "POST";
  headers?: Record<string, string>;
}>;

function pendingDirectory() {
  if (!FileSystem.documentDirectory) throw new Error("Persistent app storage is unavailable.");
  return `${FileSystem.documentDirectory}proofmode-pending/`;
}

async function accessToken() {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error("Sign in again before uploading.");
  return data.session.access_token;
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
      resumeMediaId,
    }),
  }) as Promise<UploadIntent>;
}

export async function savePendingUpload(draft: UploadDraft, intent: UploadIntent) {
  const pending: PendingUpload = {
    version: 1,
    mediaId: intent.mediaId,
    postId: intent.postId,
    challengeId: draft.challengeId,
    kind: draft.kind,
    caption: draft.caption,
    media: draft.media,
  };
  await AsyncStorage.setItem(PENDING_UPLOAD_KEY, JSON.stringify(pending));
  return pending;
}

export async function loadPendingUpload(): Promise<PendingUpload | null> {
  const raw = await AsyncStorage.getItem(PENDING_UPLOAD_KEY);
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw) as PendingUpload;
    if (pending.version !== 1 || !pending.mediaId || !pending.media?.uri) throw new Error("invalid");
    const info = await FileSystem.getInfoAsync(pending.media.uri);
    if (!info.exists) {
      await AsyncStorage.removeItem(PENDING_UPLOAD_KEY);
      return null;
    }
    return pending;
  } catch {
    await AsyncStorage.removeItem(PENDING_UPLOAD_KEY);
    return null;
  }
}

export async function clearPendingUpload(pending: PendingUpload) {
  await AsyncStorage.removeItem(PENDING_UPLOAD_KEY);
  await removePersistedMedia(pending.media.uri);
}

export async function uploadToProvider(
  media: SelectedMedia,
  intent: UploadIntent,
  onProgress: (progress: number) => void,
) {
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
  const draft: UploadDraft = {
    challengeId: pending.challengeId,
    kind: pending.kind,
    caption: pending.caption,
    media: pending.media,
  };
  const intent = await createUploadIntent(draft, pending.mediaId);
  await uploadToProvider(pending.media, intent, onProgress);
  return finalizeUpload(pending.mediaId);
}

export async function discardPendingUpload(pending: PendingUpload) {
  await api(`/api/media/assets/${encodeURIComponent(pending.mediaId)}`, { method: "DELETE" });
  await clearPendingUpload(pending);
}
