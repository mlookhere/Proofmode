import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { disablePushToken, registerPushToken } from "@/api/notifications";

const registrationKey = "proofmode.push-registration.v1";
const androidChannelId = "proofmode-stakes";

type StoredRegistration = Readonly<{
  userId: string;
  token: string;
}>;

export type PushRegistrationStatus =
  | "unsupported"
  | "not_granted"
  | "not_configured"
  | "account_mismatch"
  | "registered";

export type PushRegistrationResult = Readonly<{
  status: PushRegistrationStatus;
  token: string | null;
}>;

function projectId() {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

async function readStoredRegistration(): Promise<StoredRegistration | null> {
  try {
    const raw = await AsyncStorage.getItem(registrationKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<StoredRegistration>;
    if (typeof value.userId !== "string" || typeof value.token !== "string") return null;
    return { userId: value.userId, token: value.token };
  } catch {
    return null;
  }
}

async function writeStoredRegistration(value: StoredRegistration) {
  await AsyncStorage.setItem(registrationKey, JSON.stringify(value));
}

export async function configureNotificationChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(androidChannelId, {
    name: "ProofMode stakes",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 150, 250],
  });
}

async function acquireExpoToken() {
  const id = projectId();
  if (!id) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId: id })).data;
}

export async function syncGrantedPushRegistration(userId: string): Promise<PushRegistrationResult> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { status: "unsupported", token: null };
  }

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted) return { status: "not_granted", token: null };

  await configureNotificationChannel();
  const token = await acquireExpoToken();
  if (!token) return { status: "not_configured", token: null };

  const previous = await readStoredRegistration();
  if (previous && previous.userId !== userId && previous.token === token) {
    return { status: "account_mismatch", token };
  }

  if (previous?.userId === userId && previous.token !== token) {
    try {
      await disablePushToken(previous.token);
    } catch {
      // Registering the replacement token is more important than cleanup of a stale token.
    }
  }

  await registerPushToken(token, Platform.OS);
  await writeStoredRegistration({ userId, token });
  return { status: "registered", token };
}

export async function requestPushPermissionAndRegister(userId: string): Promise<PushRegistrationResult> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    return { status: "unsupported", token: null };
  }

  await configureNotificationChannel();
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) {
    const requested = await Notifications.requestPermissionsAsync();
    if (!requested.granted) return { status: "not_granted", token: null };
  }
  return syncGrantedPushRegistration(userId);
}

export async function disableCurrentDevicePush() {
  const current = await readStoredRegistration();
  if (!current) return false;
  try {
    return await disablePushToken(current.token);
  } finally {
    await AsyncStorage.removeItem(registrationKey);
  }
}
