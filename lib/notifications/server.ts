import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/media/server";

const EXPO_SEND_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const MAX_BATCH = 100;

const FINAL_DELIVERY_STATES = new Set(["ticket_ok", "ticket_error", "delivered", "disabled"]);

type PushTokenTarget = Readonly<{ id: string; token: string }>;
type PushContext = Readonly<{
  allowed?: boolean;
  reason?: string | null;
  defer_until?: string | null;
  recipient_id?: string;
  title?: string;
  body?: string;
  route?: string;
  tokens?: PushTokenTarget[];
}>;

type ExpoTicket = Readonly<{
  status?: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}>;

type ExpoReceipt = ExpoTicket;

class PushProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "PushProviderError";
    this.retryable = retryable;
  }
}

function expoHeaders() {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  const token = process.env.EXPO_ACCESS_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

function providerError(response: Response, fallback: string) {
  return new PushProviderError(fallback, response.status === 429 || response.status >= 500);
}

function retryAt(attempts: number) {
  const seconds = Math.min(3600, 30 * 2 ** Math.max(0, attempts - 1));
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function updateJob(
  admin: SupabaseClient,
  jobId: number,
  values: Record<string, unknown>,
) {
  const { error } = await admin
    .from("job_outbox")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("kind", "push");
  if (error) throw error;
}

async function disableToken(
  admin: SupabaseClient,
  tokenId: string,
  reason: string,
  message?: string | null,
) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("push_tokens")
    .update({
      enabled: false,
      disabled_at: now,
      disabled_reason: reason.slice(0, 120),
      last_error: message?.slice(0, 500) || null,
      updated_at: now,
    })
    .eq("id", tokenId);
  if (error) throw error;
}

async function upsertDelivery(
  admin: SupabaseClient,
  values: {
    job_id: number;
    token_id: string;
    recipient_id: string;
    expo_ticket_id?: string | null;
    status: string;
    error_code?: string | null;
    error_message?: string | null;
    attempt_count?: number;
    sent_at?: string | null;
    receipt_checked_at?: string | null;
  },
) {
  const now = new Date().toISOString();
  const { error } = await admin.from("push_deliveries").upsert({
    ...values,
    updated_at: now,
  }, { onConflict: "job_id,token_id" });
  if (error) throw error;
}

async function sendExpoBatch(
  context: PushContext,
  targets: PushTokenTarget[],
): Promise<ExpoTicket[]> {
  const response = await fetch(EXPO_SEND_URL, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify(targets.map((target) => ({
      to: target.token,
      title: context.title,
      body: context.body,
      sound: "default",
      data: { route: context.route },
    }))),
  });
  if (!response.ok) throw providerError(response, `Expo push send failed (${response.status})`);
  const payload = await response.json() as { data?: ExpoTicket | ExpoTicket[]; errors?: Array<{ message?: string }> };
  const tickets = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  if (tickets.length !== targets.length) {
    throw new PushProviderError(payload.errors?.[0]?.message || "Expo returned an unexpected ticket count", true);
  }
  return tickets;
}

async function processReceipts(admin: SupabaseClient) {
  const cutoff = new Date(Date.now() - RECEIPT_DELAY_MS).toISOString();
  const { data: deliveries, error } = await admin
    .from("push_deliveries")
    .select("id,token_id,expo_ticket_id")
    .eq("status", "ticket_ok")
    .not("expo_ticket_id", "is", null)
    .lt("sent_at", cutoff)
    .order("sent_at", { ascending: true })
    .limit(MAX_BATCH);
  if (error) throw error;
  if (!deliveries?.length) return { checked: 0, delivered: 0, failed: 0, disabled: 0 };

  const ids = deliveries.map((item) => item.expo_ticket_id as string);
  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: "POST",
    headers: expoHeaders(),
    body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw providerError(response, `Expo receipt request failed (${response.status})`);
  const payload = await response.json() as { data?: Record<string, ExpoReceipt> };
  const receiptMap = payload.data || {};
  const now = new Date().toISOString();
  let delivered = 0;
  let failed = 0;
  let disabled = 0;

  for (const delivery of deliveries) {
    const ticketId = delivery.expo_ticket_id as string;
    const receipt = receiptMap[ticketId];
    if (!receipt) continue;
    const errorCode = receipt.details?.error || null;
    if (receipt.status === "ok") {
      const { error: updateError } = await admin
        .from("push_deliveries")
        .update({ status: "delivered", receipt_checked_at: now, updated_at: now, error_code: null, error_message: null })
        .eq("id", delivery.id)
        .eq("status", "ticket_ok");
      if (updateError) throw updateError;
      delivered += 1;
      continue;
    }

    if (errorCode === "DeviceNotRegistered") {
      await disableToken(admin, delivery.token_id, errorCode, receipt.message);
      const { error: updateError } = await admin
        .from("push_deliveries")
        .update({
          status: "disabled",
          receipt_checked_at: now,
          updated_at: now,
          error_code: errorCode,
          error_message: receipt.message?.slice(0, 500) || null,
        })
        .eq("id", delivery.id);
      if (updateError) throw updateError;
      disabled += 1;
      continue;
    }

    const { error: updateError } = await admin
      .from("push_deliveries")
      .update({
        status: "failed",
        receipt_checked_at: now,
        updated_at: now,
        error_code: errorCode,
        error_message: receipt.message?.slice(0, 500) || "Expo receipt error",
      })
      .eq("id", delivery.id);
    if (updateError) throw updateError;
    failed += 1;
  }

  return { checked: deliveries.length, delivered, failed, disabled };
}

async function processJob(admin: SupabaseClient, jobId: number) {
  const { data: jobRow, error: jobError } = await admin
    .from("job_outbox")
    .select("attempts")
    .eq("id", jobId)
    .eq("kind", "push")
    .maybeSingle();
  if (jobError) throw jobError;
  if (!jobRow) return { jobId, result: "missing" as const };

  const { data, error } = await admin.rpc("get_push_job_delivery_v1", { target_job: jobId });
  if (error) throw error;
  const context = data as PushContext | null;
  if (!context?.allowed) {
    if (context?.reason === "quiet_hours" && context.defer_until) {
      await updateJob(admin, jobId, {
        status: "pending",
        run_after: context.defer_until,
        locked_at: null,
        attempts: Math.max(0, Number(jobRow.attempts || 1) - 1),
        last_error: "deferred for quiet hours",
      });
      return { jobId, result: "deferred" as const };
    }
    await updateJob(admin, jobId, {
      status: "done",
      locked_at: null,
      last_error: context?.reason ? `skipped: ${context.reason}` : "skipped",
    });
    return { jobId, result: "skipped" as const };
  }

  const recipientId = context.recipient_id;
  const targets = context.tokens || [];
  if (!recipientId || !context.title || !context.body || !context.route || !targets.length) {
    await updateJob(admin, jobId, { status: "dead", locked_at: null, last_error: "invalid delivery context" });
    return { jobId, result: "dead" as const };
  }

  const { data: existing, error: existingError } = await admin
    .from("push_deliveries")
    .select("token_id,status")
    .eq("job_id", jobId);
  if (existingError) throw existingError;
  const states = new Map((existing || []).map((item) => [item.token_id as string, item.status as string]));
  const pendingTargets = targets.filter((target) => !FINAL_DELIVERY_STATES.has(states.get(target.id) || ""));
  if (!pendingTargets.length) {
    await updateJob(admin, jobId, { status: "done", locked_at: null, last_error: null });
    return { jobId, result: "already_sent" as const };
  }

  try {
    const tickets = await sendExpoBatch(context, pendingTargets);
    let retryableTicket = false;
    for (let index = 0; index < pendingTargets.length; index += 1) {
      const target = pendingTargets[index];
      const ticket = tickets[index] || {};
      const errorCode = ticket.details?.error || null;
      if (ticket.status === "ok" && ticket.id) {
        await upsertDelivery(admin, {
          job_id: jobId,
          token_id: target.id,
          recipient_id: recipientId,
          expo_ticket_id: ticket.id,
          status: "ticket_ok",
          error_code: null,
          error_message: null,
          attempt_count: Number(jobRow.attempts || 1),
          sent_at: new Date().toISOString(),
          receipt_checked_at: null,
        });
        continue;
      }

      if (errorCode === "DeviceNotRegistered") {
        await disableToken(admin, target.id, errorCode, ticket.message);
        await upsertDelivery(admin, {
          job_id: jobId,
          token_id: target.id,
          recipient_id: recipientId,
          status: "disabled",
          error_code: errorCode,
          error_message: ticket.message || null,
          attempt_count: Number(jobRow.attempts || 1),
          sent_at: new Date().toISOString(),
        });
        continue;
      }

      const retryable = errorCode === "MessageRateExceeded";
      retryableTicket ||= retryable;
      await upsertDelivery(admin, {
        job_id: jobId,
        token_id: target.id,
        recipient_id: recipientId,
        status: retryable ? "failed" : "ticket_error",
        error_code: errorCode,
        error_message: ticket.message || "Expo ticket error",
        attempt_count: Number(jobRow.attempts || 1),
        sent_at: new Date().toISOString(),
      });
    }

    if (retryableTicket) {
      await updateJob(admin, jobId, {
        status: "failed",
        run_after: retryAt(Number(jobRow.attempts || 1)),
        locked_at: null,
        last_error: "Expo message rate exceeded",
      });
      return { jobId, result: "retry" as const };
    }

    await updateJob(admin, jobId, { status: "done", locked_at: null, last_error: null });
    return { jobId, result: "sent" as const };
  } catch (cause) {
    const retryable = cause instanceof PushProviderError ? cause.retryable : true;
    await updateJob(admin, jobId, {
      status: retryable && Number(jobRow.attempts || 1) < 5 ? "failed" : "dead",
      run_after: retryable ? retryAt(Number(jobRow.attempts || 1)) : new Date().toISOString(),
      locked_at: null,
      last_error: cause instanceof Error ? cause.message.slice(0, 500) : "push delivery failed",
    });
    return { jobId, result: retryable ? "retry" as const : "dead" as const };
  }
}

export async function processPushNotifications() {
  const admin = adminClient();
  const receiptResult = await processReceipts(admin);

  const { data: dueData, error: dueError } = await admin.rpc("enqueue_due_notification_stakes_v1", {
    reference_time: new Date().toISOString(),
  });
  if (dueError) throw dueError;

  const { data: claimed, error: claimError } = await admin.rpc("claim_push_jobs_v1", { max_items: 50 });
  if (claimError) throw claimError;
  const jobs = (claimed || []) as Array<{ job_id: number }>;
  const results = [];
  for (const job of jobs) results.push(await processJob(admin, Number(job.job_id)));

  return {
    stakesEnqueued: Number(dueData || 0),
    claimed: jobs.length,
    receipts: receiptResult,
    results,
  };
}
