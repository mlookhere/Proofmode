import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MediaApiError,
  adminClient,
  asMediaApiResponse,
  r2PublicUrl,
  readR2Object,
  requireBearerUser,
} from "@/lib/media/server";

export async function POST(request: Request) {
  try {
    const user = await requireBearerUser(request);
    const body = await request.json() as { mediaId?: unknown };
    const mediaId = typeof body.mediaId === "string" ? body.mediaId : "";
    if (!mediaId) throw new MediaApiError(400, "mediaId is required");

    const admin = adminClient();
    const { data: asset, error } = await admin
      .from("media_assets")
      .select("id, owner_id, provider, media_kind, storage_key, mime_type, processing_status")
      .eq("id", mediaId)
      .maybeSingle();
    if (error) throw error;
    if (!asset || asset.owner_id !== user.id) throw new MediaApiError(404, "Upload not found");

    if (asset.provider === "r2") {
      if (!asset.storage_key) throw new MediaApiError(409, "Image upload has no storage key");
      const remote = await readR2Object(asset.storage_key);
      if (!remote.bytes || remote.bytes <= 0) throw new MediaApiError(409, "Image upload is incomplete");
      if (remote.bytes > MAX_IMAGE_BYTES) throw new MediaApiError(413, "Image exceeds the 20 MB limit");
      const mimeType = remote.mimeType?.toLowerCase() || asset.mime_type?.toLowerCase() || "";
      if (!IMAGE_MIME_TYPES.has(mimeType)) throw new MediaApiError(415, "Uploaded image type is not allowed");

      const { error: updateError } = await admin
        .from("media_assets")
        .update({
          bytes: remote.bytes,
          mime_type: mimeType,
          public_url: r2PublicUrl(asset.storage_key),
          processing_status: "ready",
        })
        .eq("id", mediaId)
        .eq("owner_id", user.id);
      if (updateError) throw updateError;
    } else if (asset.provider === "stream") {
      if (asset.processing_status === "uploading") {
        const { error: updateError } = await admin
          .from("media_assets")
          .update({ processing_status: "processing" })
          .eq("id", mediaId)
          .eq("owner_id", user.id);
        if (updateError) throw updateError;
      }
    } else {
      throw new MediaApiError(409, "Unsupported upload provider");
    }

    const { data: post, error: postError } = await admin
      .from("posts")
      .select("id, status, moderation_status")
      .eq("media_asset_id", mediaId)
      .maybeSingle();
    if (postError) throw postError;
    if (!post) throw new MediaApiError(409, "Upload has no post");

    return Response.json({ postId: post.id, status: post.status, moderationStatus: post.moderation_status });
  } catch (error) {
    return asMediaApiResponse(error);
  }
}
