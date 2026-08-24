import { MediaApiError, adminClient, asMediaApiResponse, deleteProviderAsset, requireBearerUser } from "@/lib/media/server";

export async function DELETE(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const { mediaId } = await params;
    if (!mediaId) throw new MediaApiError(400, "mediaId is required");

    const admin = adminClient();
    const { data: asset, error } = await admin
      .from("media_assets")
      .select("id, owner_id, provider, storage_key, playback_id, processing_status, moderation_status")
      .eq("id", mediaId)
      .maybeSingle();
    if (error) throw error;
    if (!asset || asset.owner_id !== user.id) throw new MediaApiError(404, "Upload not found");
    if (asset.processing_status === "deleted") return new Response(null, { status: 204 });

    const { data: post, error: postError } = await admin
      .from("posts")
      .select("id, status")
      .eq("media_asset_id", mediaId)
      .maybeSingle();
    if (postError) throw postError;
    if (!post) throw new MediaApiError(409, "Upload has no post");
    if (post.status === "published" || asset.moderation_status === "approved") {
      throw new MediaApiError(409, "Published media cannot be discarded here");
    }

    const { data: claimed, error: claimError } = await admin
      .from("media_assets")
      .update({ processing_status: "deleted" })
      .eq("id", mediaId)
      .eq("owner_id", user.id)
      .neq("processing_status", "deleted")
      .neq("moderation_status", "approved")
      .select("id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw new MediaApiError(409, "Upload can no longer be discarded");

    try {
      await deleteProviderAsset(asset);
    } catch (providerError) {
      await admin
        .from("media_assets")
        .update({ processing_status: "failed", moderation_status: "pending" })
        .eq("id", mediaId)
        .eq("processing_status", "deleted");
      throw providerError;
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return asMediaApiResponse(error);
  }
}
