import { processPushNotifications } from "@/lib/notifications/server";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json(await processPushNotifications());
  } catch (error) {
    console.error("Notification processing failed", error);
    return Response.json({ error: "Notification processing failed" }, { status: 500 });
  }
}
