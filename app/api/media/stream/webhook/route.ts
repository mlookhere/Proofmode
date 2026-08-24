import { MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, MediaApiError, adminClient, asMediaApiResponse, verifyStreamWebhook } from "@/lib/media/server";

type StreamWebhook = Readonly<{
  uid?: string;
  readyToStream?: boolean;
  status?: { state?: string; errorReasonCode?: string; errorReasonText?: string };
  duration?: number;
  size?: number;
  input?: { width?: number; height?: number };
  playback?: { hls?: string; dash?: string };
}>;

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    verifyStreamWebhook(rawBody, request.headers.get("webhook-signature"));

    let payload: StreamWebhook;
    try {
      payload = JSON.parse(rawBody) as StreamWebhook;
    } catch {
      throw new MediaApiError(400, "Invalid Stream webhook body");
    }

    const uid = typeof payload.uid === "string" ? payload.uid : "";
    if (!uid) throw new MediaApiError(400, "Stream uid is required");

    const admin = adminClient();
    const { data: asset, error } = await admin
      .from("media_assets")
      .select("id, owner_id, processing_status")
      .eq("provider", "stream")
      .eq("playback_id", uid)
      .maybeSingle();
    if (error) throw error;
    if (!asset) return Response.json({ ok: true, ignored: true });

    const state = payload.status?.state || "";
    const duration = Number.isFinite(payload.duration) ? Number(payload.duration) : null;
    const bytes = Number.isFinite(payload.size) ? Number(payload.size) : null;

    if ((duration !== null && duration > MAX_VIDEO_SECONDS) || (bytes !== null && bytes > MAX_VIDEO_BYTES)) {
      const { error: updateError } = await admin
        .from("media_assets")
        .update({ processing_status: "failed" })
        .eq("id", asset.id);
      if (updateError) throw updateError;
      return Response.json({ ok: true, rejected: "limits" });
    }

    if (payload.readyToStream && state === "ready") {
      const hls = payload.playback?.hls;
      if (!hls) throw new MediaApiError(409, "Ready Stream video has no HLS playback URL");
      const { error: updateError } = await admin
        .from("media_assets")
        .update({
          processing_status: "ready",
          public_url: hls,
          duration_seconds: duration,
          bytes,
          width: payload.input?.width ?? null,
          height: payload.input?.height ?? null,
        })
        .eq("id", asset.id);
      if (updateError) throw updateError;
      return Response.json({ ok: true, status: "ready" });
    }

    if (state === "error") {
      const { error: updateError } = await admin
        .from("media_assets")
        .update({ processing_status: "failed" })
        .eq("id", asset.id);
      if (updateError) throw updateError;
      return Response.json({ ok: true, status: "failed" });
    }

    if (asset.processing_status !== "processing") {
      const { error: updateError } = await admin
        .from("media_assets")
        .update({ processing_status: "processing" })
        .eq("id", asset.id);
      if (updateError) throw updateError;
    }
    return Response.json({ ok: true, status: "processing" });
  } catch (error) {
    return asMediaApiResponse(error);
  }
}
