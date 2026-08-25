import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFile(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const requireAll = (source, values, label) => {
  for (const value of values) assert(source.includes(value), `${label} is missing: ${value}`);
};

const mobilePackage = JSON.parse(await read("mobile/package.json"));
const mobileLock = JSON.parse(await read("mobile/package-lock.json"));
const appConfig = JSON.parse(await read("mobile/app.json")).expo;

assert(mobilePackage.dependencies?.["expo-notifications"] === "~57.0.14", "Mobile expo-notifications must stay on the SDK 57 compatible line");
assert(mobileLock.packages?.[""]?.dependencies?.["expo-notifications"] === "~57.0.14", "Mobile lockfile is missing expo-notifications");
assert(mobileLock.packages?.["node_modules/expo-notifications"]?.version?.startsWith("57.0."), "Resolved expo-notifications package is outside SDK 57");
assert(appConfig?.plugins?.some((plugin) => plugin === "expo-notifications" || (Array.isArray(plugin) && plugin[0] === "expo-notifications")), "Expo notifications native plugin is missing");

const notificationApi = await read("mobile/src/api/notifications.ts");
for (const rpc of [
  "register_push_token_v1",
  "disable_push_token_v1",
  "get_notification_preferences_v1",
  "set_notification_preferences_v1",
]) assert(notificationApi.includes(`"${rpc}"`), `Mobile notification API is missing ${rpc}`);
requireAll(notificationApi, ["recap: false", "quiet_hours_start", "quiet_hours_end", "timezone"], "Mobile notification API");

const device = await read("mobile/src/notifications/device.ts");
requireAll(device, [
  "proofmode.push-registration.v1",
  "getExpoPushTokenAsync",
  "projectId",
  "Constants.expoConfig?.extra?.eas?.projectId",
  "Constants.easConfig?.projectId",
  "getPermissionsAsync",
  "requestPermissionsAsync",
  "syncGrantedPushRegistration",
  "requestPushPermissionAndRegister",
  "registerPushToken",
  "disablePushToken",
  "unregisterForNotificationsAsync",
  "account_mismatch",
], "Mobile notification device lifecycle");
const silentSyncBody = device.slice(
  device.indexOf("export async function syncGrantedPushRegistration"),
  device.indexOf("export async function requestPushPermissionAndRegister"),
);
assert(!silentSyncBody.includes("requestPermissionsAsync"), "Background push sync must never request notification permission");
const explicitPermissionBody = device.slice(
  device.indexOf("export async function requestPushPermissionAndRegister"),
  device.indexOf("export async function disableCurrentDevicePush"),
);
assert(explicitPermissionBody.includes("requestPermissionsAsync"), "Explicit device-push enable path must own the permission request");

const runtime = await read("mobile/src/notifications/runtime.tsx");
requireAll(runtime, [
  "PushNotificationsProvider",
  "getLastNotificationResponseAsync",
  "addNotificationResponseReceivedListener",
  "addPushTokenListener",
  "syncGrantedPushRegistration",
  "requestPushPermissionAndRegister",
  "enable: () => sync(true)",
  "refresh: () => sync(false)",
  "router.push",
  "shouldShowBanner: true",
  "shouldShowList: true",
], "Mobile notification runtime");
for (const routeMarker of ["(p|r|j)", "^\\/c\\/", "^\\/u\\/", "^\\/invite\\/"]) {
  assert(runtime.includes(routeMarker), `Notification canonical route allowlist is missing ${routeMarker}`);
}
const sessionStartup = runtime.slice(runtime.indexOf("useEffect(() => {\n    if (!userId)"), runtime.indexOf("useEffect(() => {\n    void Notifications.getLastNotificationResponseAsync"));
assert(sessionStartup.includes("sync(false)"), "Signed-in startup must only perform silent push sync");
assert(!sessionStartup.includes("sync(true)"), "Signed-in startup must not prompt for notification permission");

const settings = await read("mobile/app/settings/notifications.tsx");
requireAll(settings, [
  "usePushNotifications",
  "ENABLE DEVICE PUSH",
  "saveNotificationPreferences",
  "social",
  "drop_updates",
  "streak_risk",
  "crew_position",
  "journey_updates",
  "invites",
  "QUIET HOURS",
  "Intl.DateTimeFormat().resolvedOptions().timeZone",
], "Notification settings screen");
assert(!settings.includes("RECAP"), "Recap must remain P1 and absent from Stage 11 settings");

const rootLayout = await read("mobile/app/_layout.tsx");
requireAll(rootLayout, ["PushNotificationsProvider", "<AuthProvider>", "<PushNotificationsProvider>"], "Mobile root notification wiring");
const authSession = await read("mobile/src/auth/session.tsx");
requireAll(authSession, ["disableCurrentDevicePush", "await disableCurrentDevicePush().catch", "await supabase.auth.signOut()"], "Push-aware logout");
assert(authSession.indexOf("disableCurrentDevicePush") < authSession.lastIndexOf("supabase.auth.signOut"), "Device push cleanup must happen before auth sign-out");
const passport = await read("mobile/app/(tabs)/you.tsx");
requireAll(passport, ["/settings/notifications", "NOTIFICATIONS", "DEVICE PUSH · CLASSES · QUIET HOURS"], "Passport notification settings entry");

console.log("Stage 11 notification static validation passed.");
