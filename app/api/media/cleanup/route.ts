import { STALE_UPLOAD_HOURS, adminClient, asMediaApiResponse, deleteProviderAsset } from "@/lib/media/server";

const CLEANABLE_STATES = ["pending", "uploading", "processing", "failed"] as const;

export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = adminClient();
    const cutoff = new Date(Date.now() - STALE_UPLOAD_HOURS * 60 * 60 * 1000).toISOString();
    const { data: assets, error } = await admin
      .from("media_assets")
      .select("id, provider, storage_key, playback_id, processing_status")
      .in("processing_status", [...CLEANABLE_STATES])
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(50);
    if (error) throw error;

    let deleted = 0;
    const failures: string[] = [];
    for (const asset of assets ?? []) {
      const { data: claimed, error: claimError } = await admin
        .from("media_assets")
        .update({ processing_status: "deleted" })
        .eq("id", asset.id)
        .in("processing_status", [...CLEANABLE_STATES])
        .lt("updated_at", cutoff)
        .select("id")
        .maybeSingle();
      if (claimError) throw claimError;
      if (!claimed) continue;

      try {
        await deleteProviderAsset(asset);
        deleted += 1;
      } catch (error) {
        await admin
          .from("media_assets")
          .update({ processing_status: "failed", moderation_status: "pending" })
          .eq("id", asset.id)
          .eq("processing_status", "deleted");
        console.error("Media cleanup failed", asset.id, error);
        failures.push(asset.id);
      }
    }

    return Response.json({ checked: assets?.length ?? 0, deleted, failed: failures.length, failures });
  } catch (error) {
    return asMediaApiResponse(error);
  }
}
