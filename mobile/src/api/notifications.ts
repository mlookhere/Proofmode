import { requireSupabase } from "@/lib/supabase";

export type NotificationPreferences = Readonly<{
  social: boolean;
  drop_updates: boolean;
  streak_risk: boolean;
  crew_position: boolean;
  journey_updates: boolean;
  invites: boolean;
  recap: false;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string;
}>;

export type NotificationPreferenceInput = Readonly<{
  social: boolean;
  dropUpdates: boolean;
  streakRisk: boolean;
  crewPosition: boolean;
  journeyUpdates: boolean;
  invites: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timezone: string;
}>;

export async function registerPushToken(token: string, platform: "ios" | "android") {
  const { data, error } = await requireSupabase().rpc("register_push_token_v1", {
    target_token: token,
    target_platform: platform,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Could not register this device for notifications.");
  return data;
}

export async function disablePushToken(token: string) {
  const { data, error } = await requireSupabase().rpc("disable_push_token_v1", { target_token: token });
  if (error) throw error;
  return Boolean(data);
}

export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const { data, error } = await requireSupabase().rpc("get_notification_preferences_v1");
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Could not load notification preferences.");
  return data as NotificationPreferences;
}

export async function saveNotificationPreferences(input: NotificationPreferenceInput): Promise<NotificationPreferences> {
  const { data, error } = await requireSupabase().rpc("set_notification_preferences_v1", {
    target_social: input.social,
    target_drop_updates: input.dropUpdates,
    target_streak_risk: input.streakRisk,
    target_crew_position: input.crewPosition,
    target_journey_updates: input.journeyUpdates,
    target_invites: input.invites,
    target_quiet_hours_start: input.quietHoursStart ?? null,
    target_quiet_hours_end: input.quietHoursEnd ?? null,
    target_timezone: input.timezone,
  });
  if (error) throw error;
  if (!data || typeof data !== "object") throw new Error("Could not save notification preferences.");
  return data as NotificationPreferences;
}
