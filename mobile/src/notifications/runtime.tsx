import type { PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { AppState } from "react-native";
import { useAuth } from "@/auth/session";
import {
  requestPushPermissionAndRegister,
  syncGrantedPushRegistration,
  type PushRegistrationStatus,
} from "@/notifications/device";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

type PushRuntimeStatus = "idle" | "registering" | PushRegistrationStatus | "error";

type PushRuntime = Readonly<{
  status: PushRuntimeStatus;
  error: string | null;
  enable: () => Promise<void>;
  refresh: () => Promise<void>;
}>;

const PushRuntimeContext = createContext<PushRuntime | null>(null);

function canonicalRoute(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 160) return null;
  if (/^\/(p|r|j)\/[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(value)) return value;
  if (/^\/c\/[a-z0-9][a-z0-9-]{0,79}$/.test(value)) return value;
  if (/^\/u\/[A-Za-z0-9_][A-Za-z0-9_-]{0,39}$/.test(value)) return value;
  if (/^\/invite\/[A-Za-z0-9_-]{8,64}$/.test(value)) return value;
  return null;
}

export function PushNotificationsProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [status, setStatus] = useState<PushRuntimeStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastResponseKey = useRef<string | null>(null);

  const sync = useCallback(async (requestPermission: boolean) => {
    if (!userId) {
      setStatus("idle");
      setError(null);
      return;
    }
    setStatus("registering");
    setError(null);
    try {
      const result = requestPermission
        ? await requestPushPermissionAndRegister(userId)
        : await syncGrantedPushRegistration(userId);
      setStatus(result.status);
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not register this device for push notifications.");
    }
  }, [userId]);

  const openResponse = useCallback((response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    const key = `${response.notification.request.identifier}:${response.actionIdentifier}`;
    if (lastResponseKey.current === key) return;
    const route = canonicalRoute(response.notification.request.content.data?.route);
    if (!route) return;
    lastResponseKey.current = key;
    router.push(route as never);
  }, [router]);

  useEffect(() => {
    if (!userId) {
      setStatus("idle");
      setError(null);
      return;
    }
    void sync(false);
  }, [userId, sync]);

  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then(openResponse).catch(() => undefined);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(openResponse);
    return () => responseSubscription.remove();
  }, [openResponse]);

  useEffect(() => {
    if (!userId) return;
    const appStateSubscription = AppState.addEventListener("change", (next) => {
      if (next === "active") void sync(false);
    });
    const tokenSubscription = Notifications.addPushTokenListener(() => {
      void sync(false);
    });
    return () => {
      appStateSubscription.remove();
      tokenSubscription.remove();
    };
  }, [userId, sync]);

  const value = useMemo<PushRuntime>(() => ({
    status,
    error,
    enable: () => sync(true),
    refresh: () => sync(false),
  }), [status, error, sync]);

  return <PushRuntimeContext.Provider value={value}>{children}</PushRuntimeContext.Provider>;
}

export function usePushNotifications() {
  const value = useContext(PushRuntimeContext);
  if (!value) throw new Error("usePushNotifications must be used inside PushNotificationsProvider");
  return value;
}
