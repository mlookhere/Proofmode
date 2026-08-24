import { MediaApiError, adminClient, asMediaApiResponse, deleteProviderAsset, requireBearerUser } from "@/lib/media/server";

export async function DELETE(request: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  try {
    const user = await requireBearerUser(request);
    const { mediaId } = await params;
    if (!mediaId) throw new MediaApiError(400, "mediaId is required");

    const admin = adminClient();
    const { data: asset, error } = await admin
      .from("media_assets")
      .select("id, owner_id, provider, storage_key, playback_id, processing_status")
      .eq("id", mediaId)
      .maybeSingle();
    if (error) throw error;
    if (!asset || asset.owner_id !== user.id) throw new MediaApiError(404, "Upload not found");

    if (asset.processing_status !== "deleted") {
      await deleteProviderAsset(asset);
      const { error: updateError } = await admin
        .from("media_assets")
        .update({ processing_status: "deleted" })
        .eq("id", mediaId)
        .eq("owner_id", user.id);
      if (updateError) throw updateError;
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    return asMediaApiResponse(error);
  }
}
