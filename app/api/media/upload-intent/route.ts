import { randomUUID } from "node:crypto";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MediaApiError,
  VIDEO_MIME_TYPES,
  adminClient,
  asMediaApiResponse,
  assertPublicChallengeMembership,
  assertUploadRate,
  createR2UploadUrl,
  createStreamDirectUpload,
  deleteProviderAsset,
  requireBearerUser,
} from "@/lib/media/server";

const POST_KINDS = new Set(["proof", "fail", "almost", "comeback", "pr", "reset"]);
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

type IntentBody = Readonly<{
  challengeId?: unknown;
  kind?: unknown;
  mediaKind?: unknown;
  mimeType?: unknown;
  bytes?: unknown;
  width?: unknown;
  height?: unknown;
  durationSeconds?: unknown;
  caption?: unknown;
  resumeMediaId?: unknown;
}>;

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validateBody(body: IntentBody) {
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
  const kind = typeof body.kind === "string" ? body.kind : "";
  const mediaKind = body.mediaKind === "image" || body.mediaKind === "video" ? body.mediaKind : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";
  const bytes = numberOrNull(body.bytes);
  const width = numberOrNull(body.width);
  const height = numberOrNull(body.height);
  const durationSeconds = numberOrNull(body.durationSeconds);
  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  const resumeMediaId = typeof body.resumeMediaId === "string" ? body.resumeMediaId : null;

  if (!challengeId) throw new MediaApiError(400, "challengeId is required");
  if (!POST_KINDS.has(kind)) throw new MediaApiError(400, "Invalid post kind");
  if (!mediaKind) throw new MediaApiError(400, "Invalid media kind");
  if (!bytes || bytes <= 0) throw new MediaApiError(400, "Media file size is required");
  if (caption.length > 1000) throw new MediaApiError(400, "Caption is too long");

  if (mediaKind === "image") {
    if (!IMAGE_MIME_TYPES.has(mimeType)) throw new MediaApiError(400, "Unsupported image type");
    if (bytes > MAX_IMAGE_BYTES) throw new MediaApiError(413, "Image exceeds the 20 MB limit");
  } else {
    if (!VIDEO_MIME_TYPES.has(mimeType)) throw new MediaApiError(400, "Unsupported video type");
    if (bytes > MAX_VIDEO_BYTES) throw new MediaApiError(413, "Video exceeds the 200 MB limit");
    if (durationSeconds === null || durationSeconds < 0 || durationSeconds > MAX_VIDEO_SECONDS) {
      throw new MediaApiError(413, "Video exceeds the 120 second limit");
    }
  }

  return { challengeId, kind, mediaKind, mimeType, bytes, width, height, durationSeconds, caption, resumeMediaId } as const;
}

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const input = validateBody(await request.json() as IntentBody);
    const admin = adminClient();
    await assertPublicChallengeMembership(admin, user.id, input.challengeId);

    if (input.resumeMediaId) {
      const { data: asset, error } = await admin
        .from("media_assets")
        .select("id, owner_id, provider, media_kind, storage_key, playback_id, mime_type")
        .eq("id", input.resumeMediaId)
        .maybeSingle();
      if (error) throw error;
      if (!asset || asset.owner_id !== user.id) throw new MediaApiError(404, "Upload not found");
      if (asset.media_kind !== input.mediaKind || asset.mime_type !== input.mimeType) {
        throw new MediaApiError(409, "Selected media does not match the interrupted upload");
      }

      const { data: post, error: postError } = await admin
        .from("posts")
        .select("id, challenge_id")
        .eq("media_asset_id", asset.id)
        .maybeSingle();
      if (postError) throw postError;
      if (!post || post.challenge_id !== input.challengeId) throw new MediaApiError(409, "Upload Drop changed; discard it and start again");

      if (asset.provider === "r2" && asset.storage_key) {
        await admin.from("media_assets").update({ processing_status: "uploading" }).eq("id", asset.id);
        return Response.json({
          mediaId: asset.id,
          postId: post.id,
          provider: "r2",
          uploadUrl: await createR2UploadUrl(asset.storage_key, input.mimeType),
          method: "PUT",
          headers: { "Content-Type": input.mimeType },
        });
      }

      if (asset.provider === "stream") {
        const previousUid = asset.playback_id;
        const direct = await createStreamDirectUpload();
        const { error: updateError } = await admin
          .from("media_assets")
          .update({ playback_id: direct.uid, processing_status: "uploading" })
          .eq("id", asset.id)
          .eq("owner_id", user.id);
        if (updateError) throw updateError;
        if (previousUid) void deleteProviderAsset({ provider: "stream", storage_key: null, playback_id: previousUid }).catch(console.error);
        return Response.json({
          mediaId: asset.id,
          postId: post.id,
          provider: "stream",
          uploadUrl: direct.uploadURL,
          method: "POST",
        });
      }

      throw new MediaApiError(409, "Upload provider cannot be resumed");
    }

    await assertUploadRate(admin, user.id);
    const mediaId = randomUUID();
    const postId = randomUUID();
    const provider = input.mediaKind === "image" ? "r2" : "stream";
    let storageKey: string | null = null;
    let playbackId: string | null = null;
    let uploadUrl: string;
    let method: "PUT" | "POST";

    if (provider === "r2") {
      storageKey = `${user.id}/${mediaId}.${IMAGE_EXTENSIONS[input.mimeType]}`;
      uploadUrl = await createR2UploadUrl(storageKey, input.mimeType);
      method = "PUT";
    } else {
      const direct = await createStreamDirectUpload();
      playbackId = direct.uid;
      uploadUrl = direct.uploadURL;
      method = "POST";
    }

    const { error: mediaError } = await admin.from("media_assets").insert({
      id: mediaId,
      owner_id: user.id,
      provider,
      media_kind: input.mediaKind,
      storage_key: storageKey,
      playback_id: playbackId,
      mime_type: input.mimeType,
      bytes: input.bytes,
      width: input.width,
      height: input.height,
      duration_seconds: input.durationSeconds,
      processing_status: "uploading",
      moderation_status: "pending",
    });
    if (mediaError) {
      await deleteProviderAsset({ provider, storage_key: storageKey, playback_id: playbackId }).catch(() => undefined);
      throw mediaError;
    }

    const { error: postError } = await admin.from("posts").insert({
      id: postId,
      user_id: user.id,
      challenge_id: input.challengeId,
      media_asset_id: mediaId,
      kind: input.kind,
      caption: input.caption || null,
      visibility: "public",
      status: "uploading",
      moderation_status: "pending",
    });
    if (postError) {
      await admin.from("media_assets").delete().eq("id", mediaId);
      await deleteProviderAsset({ provider, storage_key: storageKey, playback_id: playbackId }).catch(() => undefined);
      throw postError;
    }

    return Response.json({
      mediaId,
      postId,
      provider,
      uploadUrl,
      method,
      headers: provider === "r2" ? { "Content-Type": input.mimeType } : undefined,
    });
  } catch (error) {
    return asMediaApiResponse(error);
  }
}
