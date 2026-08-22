import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { hasSupabaseEnv, requireSupabaseEnv } from "@/config/env";

export const isSupabaseConfigured = hasSupabaseEnv;

const env = isSupabaseConfigured ? requireSupabaseEnv() : null;

export const supabase = env
  ? createClient(env.supabaseUrl, env.supabasePublishableKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Supabase is not configured for this build.");
  }

  return supabase;
}
