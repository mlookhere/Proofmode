export const appEnvironments = ["local", "staging", "production"] as const;
export type AppEnvironment = (typeof appEnvironments)[number];

function parseAppEnvironment(value: string | undefined): AppEnvironment {
  if (!value) return "local";
  if (appEnvironments.includes(value as AppEnvironment)) return value as AppEnvironment;
  throw new Error(`Invalid EXPO_PUBLIC_APP_ENV: ${value}`);
}

export const publicEnv = Object.freeze({
  appEnvironment: parseAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV),
  apiUrl: process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, ""),
  appUrl: (process.env.EXPO_PUBLIC_APP_URL || "https://proofmode.app").replace(/\/$/, ""),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

export const hasSupabaseEnv = Boolean(publicEnv.supabaseUrl && publicEnv.supabasePublishableKey);

export function requireSupabaseEnv() {
  if (!hasSupabaseEnv) {
    throw new Error("Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  return {
    supabaseUrl: publicEnv.supabaseUrl!,
    supabasePublishableKey: publicEnv.supabasePublishableKey!,
  } as const;
}

export function requireApiUrl() {
  if (!publicEnv.apiUrl) throw new Error("Missing EXPO_PUBLIC_API_URL");
  return publicEnv.apiUrl;
}
