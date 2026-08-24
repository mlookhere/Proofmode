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
  bearerClient,
  createR2UploadUrl,
  createStreamDirectUpload,
  deleteProviderAsset,
  requireBearerUser,
} from "@/lib/media/server";

const POST_KINDS = new Set(["proof", "fail", "almost", "comeback", "pr", "reset"]);
const RECOVERABLE_MEDIA_STATES = ["pending", "uploading", "failed"] as const;
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
  resetToken?: unknown;
}>;

function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveNumberOrNull(value: unknown, field: string) {
  const parsed = numberOrNull(value);
  if (parsed !== null && parsed <= 0) throw new MediaApiError(400, `${field} must be positive`);
  return parsed;
}

function validateBody(body: IntentBody) {
  const challengeId = typeof body.challengeId === "string" ? body.challengeId : "";
  const kind = typeof body.kind === "string" ? body.kind : "";
  const mediaKind = body.mediaKind === "image" || body.mediaKind === "video" ? body.mediaKind : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";
  const bytes = numberOrNull(body.bytes);
  const width = positiveNumberOrNull(body.width, "width");
  const height = positiveNumberOrNull(body.height, "height");
  const durationSeconds = numberOrNull(body.durationSeconds);
  const caption = typeof body.caption === "string" ? body.caption.trim() : "";
  const resumeMediaId = typeof body.resumeMediaId === "string" ? body.resumeMediaId : null;
  const resetToken = typeof body.resetToken === "string" ? body.resetToken.trim() : null;

  if (!challengeId) throw new MediaApiError(400, "challengeId is required");
  if (!POST_KINDS.has(kind)) throw new MediaApiError(400, "Invalid post kind");
  if (!mediaKind) throw new MediaApiError(400, "Invalid media kind");
  if (!bytes || bytes <= 0) throw new MediaApiError(400, "Media file size is required");
  if (caption.length > 1000) throw new MediaApiError(400, "Caption is too long");
  if (kind === "reset" && (!resetToken || resetToken.length < 8 || resetToken.length > 120)) {
    throw new MediaApiError(400, "Reset requires a valid retry token");
  }

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

  return {
    challengeId,
    kind,
    mediaKind,
    mimeType,
    bytes,
    width,
    height,
    durationSeconds,
    caption,
    resumeMediaId,
    resetToken,
  } as const;
}

async function assignPostJourney(request: Request, postId: string, input: ReturnType<typeof validateBody>) {
  const client = bearerClient(request);
  const { data, error } = await client.rpc("assign_post_journey_v1", {
    target_post: postId,
    request_token: input.kind === "reset" ? input.resetToken : null,
  });
  if (error || typeof data !== "string") {
    throw new MediaApiError(409, error?.message || "Could not assign this post to a Journey");
  }
  return data;
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
        .select("id, owner_id, provider, media_kind, storage_key, playback_id, mime_type, processing_status")
        .eq("id", input.resumeMediaId)
        .maybeSingle();
      if (error) throw error;
      if (!asset || asset.owner_id !== user.id) throw new MediaApiError(404, "Upload not found");
      if (asset.media_kind !== input.mediaKind || asset.mime_type !== input.mimeType) {
        throw new MediaApiError(409, "Selected media does not match the interrupted upload");
      }

      const { data: post, error: postError } = await admin
        .from("posts")
        .select("id, challenge_id, journey_id, kind")
        .eq("media_asset_id", asset.id)
        .maybeSingle();
      if (postError) throw postError;
      if (!post || post.challenge_id !== input.challengeId || post.kind !== input.kind) {
        throw new MediaApiError(409, "Interrupted post details changed; discard it and start again");
      }

      const journeyId = post.journey_id || await assignPostJourney(request, post.id, input);

      if (asset.processing_status === "processing" || asset.processing_status === "ready") {
        return Response.json({ mediaId: asset.id, postId: post.id, journeyId, provider: asset.provider, alreadyUploaded: true });
      }
      if (asset.processing_status === "deleted") {
        throw new MediaApiError(409, "Upload was already discarded");
      }
      if (!RECOVERABLE_MEDIA_STATES.includes(asset.processing_status as (typeof RECOVERABLE_MEDIA_STATES)[number])) {
        throw new MediaApiError(409, "Upload is no longer in a retryable state");
      }

      if (asset.provider === "r2" && asset.storage_key) {
        const { data: claimed, error: updateError } = await admin
          .from("media_assets")
          .update({ processing_status: "uploading" })
          .eq("id", asset.id)
          .eq("owner_id", user.id)
          .in("processing_status", [...RECOVERABLE_MEDIA_STATES])
          .select("id")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!claimed) throw new MediaApiError(409, "Upload state changed; retry again");
        return Response.json({
          mediaId: asset.id,
          postId: post.id,
          journeyId,
          provider: "r2",
          uploadUrl: await createR2UploadUrl(asset.storage_key, input.mimeType),
          method: "PUT",
          headers: { "Content-Type": input.mimeType },
        });
      }

      if (asset.provider === "stream") {
        const previousUid = asset.playback_id;
        const direct = await createStreamDirectUpload();
        const { data: claimed, error: updateError } = await admin
          .from("media_assets")
          .update({ playback_id: direct.uid, processing_status: "uploading" })
          .eq("id", asset.id)
          .eq("owner_id", user.id)
          .in("processing_status", [...RECOVERABLE_MEDIA_STATES])
          .select("id")
          .maybeSingle();
        if (updateError || !claimed) {
          await deleteProviderAsset({ provider: "stream", storage_key: null, playback_id: direct.uid }).catch(console.error);
          if (updateError) throw updateError;
          throw new MediaApiError(409, "Upload state changed; retry again");
        }
        if (previousUid) {
          await deleteProviderAsset({ provider: "stream", storage_key: null, playback_id: previousUid }).catch(console.error);
        }
        return Response.json({
          mediaId: asset.id,
          postId: post.id,
          journeyId,
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
      journey_id: null,
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

    let journeyId: string;
    try {
      journeyId = await assignPostJourney(request, postId, input);
    } catch (error) {
      await admin.from("posts").delete().eq("id", postId);
      await admin.from("media_assets").delete().eq("id", mediaId);
      await deleteProviderAsset({ provider, storage_key: storageKey, playback_id: playbackId }).catch(() => undefined);
      throw error;
    }

    return Response.json({
      mediaId,
      postId,
      journeyId,
      provider,
      uploadUrl,
      method,
      headers: provider === "r2" ? { "Content-Type": input.mimeType } : undefined,
    });
  } catch (error) {
    return asMediaApiResponse(error);
  }
}
