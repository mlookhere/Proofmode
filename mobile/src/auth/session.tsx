import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as Linking from "expo-linking";
import { AppState } from "react-native";
import type { Session } from "@supabase/supabase-js";
import { completeAuthFromUrl } from "@/auth/deep-link";
import { syncRevenueCatIdentity } from "@/billing/revenuecat";
import { supabase } from "@/lib/supabase";
import { disableCurrentDevicePush } from "@/notifications/device";
import { recordSignupCompleted } from "@/sharing";

type AuthState = Readonly<{
  session: Session | null;
  isLoading: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signOut: () => Promise<void>;
}>;

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(supabase));
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setIsLoading(false);
      return;
    }

    let active = true;

    const handleAuthUrl = async (url: string | null) => {
      if (!url) return;
      try {
        const completed = await completeAuthFromUrl(url);
        if (completed) await recordSignupCompleted();
        if (active) setAuthError(null);
      } catch (cause) {
        if (active) setAuthError(cause instanceof Error ? cause.message : "Could not complete sign-in.");
      }
    };

    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: authListener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setIsLoading(false);
    });

    Linking.getInitialURL().then(handleAuthUrl);
    const linkListener = Linking.addEventListener("url", ({ url }) => handleAuthUrl(url));

    if (AppState.currentState === "active") client.auth.startAutoRefresh();
    const appStateListener = AppState.addEventListener("change", (state) => {
      if (state === "active") client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    });

    return () => {
      client.auth.stopAutoRefresh();
      active = false;
      authListener.subscription.unsubscribe();
      linkListener.remove();
      appStateListener.remove();
    };
  }, []);

  useEffect(() => {
    syncRevenueCatIdentity(session?.user.id ?? null).catch(() => undefined);
  }, [session?.user.id]);

  const value = useMemo<AuthState>(() => ({
    session,
    isLoading,
    authError,
    clearAuthError: () => setAuthError(null),
    signOut: async () => {
      if (!supabase) return;
      await disableCurrentDevicePush().catch(() => undefined);
      await syncRevenueCatIdentity(null).catch(() => undefined);
      await supabase.auth.signOut();
    },
  }), [session, isLoading, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
