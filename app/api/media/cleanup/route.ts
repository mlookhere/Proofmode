import { STALE_UPLOAD_HOURS, adminClient, asMediaApiResponse, deleteProviderAsset } from "@/lib/media/server";

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
      .in("processing_status", ["pending", "uploading", "processing", "failed"])
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .limit(50);
    if (error) throw error;

    let deleted = 0;
    const failures: string[] = [];
    for (const asset of assets ?? []) {
      try {
        await deleteProviderAsset(asset);
        const { error: updateError } = await admin
          .from("media_assets")
          .update({ processing_status: "deleted" })
          .eq("id", asset.id)
          .in("processing_status", ["pending", "uploading", "processing", "failed"]);
        if (updateError) throw updateError;
        deleted += 1;
      } catch (error) {
        console.error("Media cleanup failed", asset.id, error);
        failures.push(asset.id);
      }
    }

    return Response.json({ checked: assets?.length ?? 0, deleted, failed: failures.length, failures });
  } catch (error) {
    return asMediaApiResponse(error);
  }
}
