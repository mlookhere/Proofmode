import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/session";
import { PushNotificationsProvider } from "@/notifications/runtime";
import { colors } from "@/theme";

export default function RootLayout() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AuthProvider>
        <PushNotificationsProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
        </PushNotificationsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
