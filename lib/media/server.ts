import { createHmac, timingSafeEqual } from "node:crypto";
import { DeleteObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient as createSupabaseClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 120;
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
export const STALE_UPLOAD_HOURS = 24;

export const IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime"]);

export class MediaApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "MediaApiError";
    this.status = status;
  }
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new MediaApiError(503, `${name} is not configured`);
  return value;
}

function supabaseUrl() {
  return requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
}

function publishableKey() {
  return requiredEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export function adminClient(): SupabaseClient {
  return createSupabaseClient(supabaseUrl(), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireBearerUser(request: Request): Promise<User> {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new MediaApiError(401, "Authentication required");

  const authClient = createSupabaseClient(supabaseUrl(), publishableKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authClient.auth.getUser(match[1]);
  if (error || !data.user) throw new MediaApiError(401, "Invalid or expired session");
  return data.user;
}

export function asMediaApiResponse(error: unknown) {
  if (error instanceof MediaApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "Media request failed" }, { status: 500 });
}

function r2Client() {
  return new S3Client({
    region: "auto",
    endpoint: requiredEnv("CLOUDFLARE_R2_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnv("CLOUDFLARE_R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
    },
  });
}

function r2Bucket() {
  return requiredEnv("CLOUDFLARE_R2_BUCKET");
}

export async function createR2UploadUrl(storageKey: string, mimeType: string) {
  const command = new PutObjectCommand({
    Bucket: r2Bucket(),
    Key: storageKey,
    ContentType: mimeType,
  });
  return getSignedUrl(r2Client(), command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
}

export async function readR2Object(storageKey: string) {
  const result = await r2Client().send(new HeadObjectCommand({ Bucket: r2Bucket(), Key: storageKey }));
  return {
    bytes: result.ContentLength ?? null,
    mimeType: result.ContentType ?? null,
  };
}

export async function deleteR2Object(storageKey: string) {
  await r2Client().send(new DeleteObjectCommand({ Bucket: r2Bucket(), Key: storageKey }));
}

export function r2PublicUrl(storageKey: string) {
  const base = requiredEnv("CLOUDFLARE_R2_PUBLIC_BASE_URL").replace(/\/$/, "");
  const path = storageKey.split("/").map(encodeURIComponent).join("/");
  return `${base}/${path}`;
}

type StreamDirectUpload = Readonly<{ uploadURL: string; uid: string }>;

export async function createStreamDirectUpload(): Promise<StreamDirectUpload> {
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${requiredEnv("CLOUDFLARE_STREAM_API_TOKEN")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ maxDurationSeconds: MAX_VIDEO_SECONDS }),
  });
  const payload = await response.json() as {
    success?: boolean;
    result?: { uploadURL?: string; uid?: string };
    errors?: Array<{ message?: string }>;
  };
  if (!response.ok || !payload.success || !payload.result?.uploadURL || !payload.result.uid) {
    throw new MediaApiError(502, payload.errors?.[0]?.message || "Could not create Stream upload");
  }
  return { uploadURL: payload.result.uploadURL, uid: payload.result.uid };
}

export async function deleteStreamVideo(uid: string) {
  const accountId = requiredEnv("CLOUDFLARE_ACCOUNT_ID");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${requiredEnv("CLOUDFLARE_STREAM_API_TOKEN")}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new MediaApiError(502, "Could not delete Stream video");
  }
}

export function verifyStreamWebhook(rawBody: string, signatureHeader: string | null) {
  const secret = requiredEnv("CLOUDFLARE_STREAM_WEBHOOK_SECRET");
  if (!signatureHeader) throw new MediaApiError(401, "Missing Stream webhook signature");

  const values = new Map(
    signatureHeader.split(",").map((part) => {
      const [key, value] = part.trim().split("=", 2);
      return [key, value] as const;
    }),
  );
  const time = values.get("time");
  const signature = values.get("sig1");
  const timestamp = Number(time);
  if (!time || !signature || !Number.isFinite(timestamp)) throw new MediaApiError(401, "Invalid Stream webhook signature");
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) throw new MediaApiError(401, "Expired Stream webhook signature");

  const expected = createHmac("sha256", secret).update(`${time}.${rawBody}`).digest("hex");
  const expectedBytes = Buffer.from(expected, "hex");
  let actualBytes: Buffer;
  try {
    actualBytes = Buffer.from(signature, "hex");
  } catch {
    throw new MediaApiError(401, "Invalid Stream webhook signature");
  }
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new MediaApiError(401, "Invalid Stream webhook signature");
  }
}

export async function assertPublicChallengeMembership(admin: SupabaseClient, userId: string, challengeId: string) {
  const { data, error } = await admin
    .from("challenge_members")
    .select("challenge_id, challenges!inner(visibility,format)")
    .eq("user_id", userId)
    .eq("challenge_id", challengeId)
    .maybeSingle();
  if (error) throw error;
  const challenge = data?.challenges as unknown as { visibility?: string; format?: string } | null;
  if (!data || challenge?.visibility !== "public" || challenge?.format !== "drop") {
    throw new MediaApiError(403, "Choose a public Drop you have joined");
  }
}

export async function assertUploadRate(admin: SupabaseClient, userId: string) {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("media_assets")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= 10) throw new MediaApiError(429, "Too many upload attempts. Try again shortly.");
}

export async function deleteProviderAsset(asset: { provider: string; storage_key: string | null; playback_id: string | null }) {
  if (asset.provider === "r2" && asset.storage_key) return deleteR2Object(asset.storage_key);
  if (asset.provider === "stream" && asset.playback_id) return deleteStreamVideo(asset.playback_id);
}
