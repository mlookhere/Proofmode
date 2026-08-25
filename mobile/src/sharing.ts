import AsyncStorage from "@react-native-async-storage/async-storage";
import { Share } from "react-native";
import { publicEnv } from "@/config/env";
import { supabase } from "@/lib/supabase";

const attributionKey = "proofmode.attribution.v1";
const maxAttributionAgeMs = 30 * 24 * 60 * 60 * 1000;

export type AttributionContext = Readonly<{
  source: string;
  path: string;
  inviteCode: string | null;
  capturedAt: string;
  signupCompletedAt?: string;
}>;

export type AcquisitionEvent =
  | "landing_view"
  | "app_open_from_link"
  | "signup_started"
  | "signup_completed"
  | "share_started"
  | "share_completed"
  | "invite_claimed";

type CaptureInput = Readonly<{
  source?: string | null;
  path: string;
  inviteCode?: string | null;
}>;

type ShareInput = Readonly<{
  title: string;
  text: string;
  path: string;
  source: string;
}>;

function safeText(value: string | null | undefined, max: number) {
  return value?.trim().slice(0, max) || "";
}

function safePath(value: string) {
  const path = value.trim().slice(0, 500);
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function isFresh(value: AttributionContext) {
  const captured = Date.parse(value.capturedAt);
  return Number.isFinite(captured) && Date.now() - captured <= maxAttributionAgeMs;
}

export function canonicalUrl(path: string, source?: string | null) {
  const cleanPath = safePath(path);
  const cleanSource = safeText(source, 40);
  if (!cleanSource) return `${publicEnv.appUrl}${cleanPath}`;
  const separator = cleanPath.includes("?") ? "&" : "?";
  return `${publicEnv.appUrl}${cleanPath}${separator}src=${encodeURIComponent(cleanSource)}`;
}

export function receiptAssetUrl(receiptId: string, format: "story" | "portrait" | "square") {
  return `${publicEnv.appUrl}/api/share/${encodeURIComponent(receiptId)}?format=${format}`;
}

export async function getAttribution(): Promise<AttributionContext | null> {
  try {
    const raw = await AsyncStorage.getItem(attributionKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as AttributionContext;
    if (!value.source || !value.path || !value.capturedAt || !isFresh(value)) {
      await AsyncStorage.removeItem(attributionKey);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

async function saveAttribution(value: AttributionContext) {
  await AsyncStorage.setItem(attributionKey, JSON.stringify(value));
}

export async function trackAcquisitionEvent(
  eventName: AcquisitionEvent,
  source: string,
  properties: Record<string, unknown> = {},
) {
  if (!supabase) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from("analytics_events").insert({
      user_id: session?.user.id ?? null,
      event_name: eventName,
      source: safeText(source, 40) || "mobile",
      properties,
    });
  } catch {
    // Analytics is never authoritative product state.
  }
}

export async function captureCanonicalOpen({ source, path, inviteCode = null }: CaptureInput) {
  const context: AttributionContext = {
    source: safeText(source, 40) || "canonical_link",
    path: safePath(path),
    inviteCode: safeText(inviteCode, 64) || null,
    capturedAt: new Date().toISOString(),
  };
  await saveAttribution(context);
  await trackAcquisitionEvent("app_open_from_link", context.source, {
    path: context.path,
    invite_code: context.inviteCode,
  });
  return context;
}

export async function recordSignupStarted() {
  const context = await getAttribution();
  await trackAcquisitionEvent("signup_started", context?.source || "auth", {
    path: context?.path ?? null,
    invite_code: context?.inviteCode ?? null,
  });
}

export async function recordSignupCompleted() {
  const context = await getAttribution();
  if (context?.signupCompletedAt) return;
  await trackAcquisitionEvent("signup_completed", context?.source || "auth", {
    path: context?.path ?? null,
    invite_code: context?.inviteCode ?? null,
  });
  if (context) await saveAttribution({ ...context, signupCompletedAt: new Date().toISOString() });
}

export async function recordInviteClaimed(inviteCode: string, challengeId: string) {
  const context = await getAttribution();
  await trackAcquisitionEvent("invite_claimed", context?.source || "invite_link", {
    invite_code: inviteCode,
    challenge_id: challengeId,
    path: context?.path ?? `/invite/${inviteCode}`,
  });
  if (context?.inviteCode === inviteCode) await AsyncStorage.removeItem(attributionKey);
}

export async function shareCanonical({ title, text, path, source }: ShareInput) {
  const url = canonicalUrl(path, source);
  await trackAcquisitionEvent("share_started", source, { path: safePath(path) });
  const result = await Share.share({ title, message: `${text}\n${url}`, url });
  if (result.action === Share.sharedAction) {
    await trackAcquisitionEvent("share_completed", source, { path: safePath(path) });
  }
  return result;
}
