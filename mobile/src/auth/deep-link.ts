import { requireSupabase } from "@/lib/supabase";

export const authRedirectUrl = "proofmode://auth";

export function buildAuthRedirectUrl(returnTo?: string) {
  return returnTo ? `${authRedirectUrl}?returnTo=${encodeURIComponent(returnTo)}` : authRedirectUrl;
}

function getAuthParam(url: URL, key: string) {
  const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  return fragment.get(key) ?? url.searchParams.get(key);
}

export async function completeAuthFromUrl(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== "proofmode:" || url.hostname !== "auth") return false;
  const errorDescription = getAuthParam(url, "error_description");
  if (errorDescription) throw new Error(errorDescription);

  const accessToken = getAuthParam(url, "access_token");
  const refreshToken = getAuthParam(url, "refresh_token");
  if (!accessToken || !refreshToken) return false;

  const { error } = await requireSupabase().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) throw error;

  return true;
}
