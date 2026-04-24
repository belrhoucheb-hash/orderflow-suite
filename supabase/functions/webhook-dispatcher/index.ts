// Webhook dispatcher.
//
// Triggerbaar op twee manieren:
//   1. Cron (elke minuut, via CRON_SECRET): pak alle PENDING met
//      next_attempt_at <= now.
//   2. DB-webhook (service-role JWT) op webhook_deliveries INSERT:
//      lage-latency pad voor nieuwe events.
//
// Per delivery:
//   - POST naar subscription.url met HMAC-headers
//   - 2xx => status DELIVERED
//   - niet-2xx of fetch-error => attempt_count++, next_attempt_at =
//     now + backoff(attempt_count), tot MAX_ATTEMPTS dan DEAD
//   - elke poging schrijft een rij in webhook_delivery_attempts
//
// Secrets worden nooit gelogd of geretourneerd. response_body wordt
// getrunceerd op 2KB.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isTrustedCaller } from "../_shared/auth.ts";
import { corsFor, handleOptions } from "../_shared/cors.ts";
import { buildWebhookHeaders } from "../_shared/webhook-signer.ts";

const CORS_OPTIONS = { extraHeaders: ["x-cron-secret"] };
const MAX_ATTEMPTS = 6;
const PER_DELIVERY_TIMEOUT_MS = 10_000;
const BATCH_SIZE = 50;
const RESPONSE_BODY_CAP = 2048;

const BACKOFF_SECONDS: Record<number, number> = {
  1: 60,           // 1 min na 1e failure
  2: 5 * 60,       // 5 min
  3: 30 * 60,      // 30 min
  4: 2 * 60 * 60,  // 2 uur
  5: 12 * 60 * 60, // 12 uur
};

interface Delivery {
  id: string;
  tenant_id: string;
  subscription_id: string;
  event_type: string;
  event_id: string;
  payload: Record<string, unknown>;
  attempt_count: number;
}

interface Subscription {
  id: string;
  url: string;
  secret: string;
  is_active: boolean;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);

  if (!isTrustedCaller(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Twee triggerbronnen: DB-webhook (body met `record`) of cron (leeg/any).
  // We proberen in beide gevallen een batch op te pakken.
  let specificId: string | null = null;
  try {
    const body = await req.json();
    if (body?.type === "INSERT" && body?.table === "webhook_deliveries") {
      specificId = body.record?.id ?? null;
    }
  } catch {
    // geen body, cron-call
  }

  const now = new Date().toISOString();

  const query = supabase
    .from("webhook_deliveries")
    .select("id, tenant_id, subscription_id, event_type, event_id, payload, attempt_count")
    .eq("status", "PENDING")
    .lte("next_attempt_at", now)
    .order("next_attempt_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (specificId) {
    query.eq("id", specificId);
  }

  const { data: deliveries, error: fetchErr } = await query;

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!deliveries || deliveries.length === 0) {
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Subscriptions in bulk ophalen (cache-per-batch).
  const subIds = Array.from(new Set(deliveries.map((d) => d.subscription_id)));
  const { data: subs } = await supabase
    .from("webhook_subscriptions")
    .select("id, url, secret, is_active")
    .in("id", subIds);

  const subMap = new Map<string, Subscription>();
  for (const s of subs ?? []) {
    subMap.set(s.id, s as Subscription);
  }

  const results = await Promise.all(
    deliveries.map((d) => dispatchOne(supabase, d as Delivery, subMap)),
  );

  const summary = results.reduce(
    (acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return new Response(
    JSON.stringify({ processed: deliveries.length, summary }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

type Outcome = "delivered" | "retry" | "dead" | "skipped";

async function dispatchOne(
  supabase: ReturnType<typeof createClient>,
  delivery: Delivery,
  subMap: Map<string, Subscription>,
): Promise<{ id: string; outcome: Outcome }> {
  const sub = subMap.get(delivery.subscription_id);

  if (!sub || !sub.is_active) {
    await supabase
      .from("webhook_deliveries")
      .update({
        status: "DEAD",
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    return { id: delivery.id, outcome: "skipped" };
  }

  const attemptNumber = delivery.attempt_count + 1;
  const body = JSON.stringify({
    event: delivery.event_type,
    event_id: delivery.event_id,
    delivery_id: delivery.id,
    data: delivery.payload,
  });

  const headers = await buildWebhookHeaders({
    secret: sub.secret,
    eventType: delivery.event_type,
    deliveryId: delivery.id,
    body,
  });

  const started = Date.now();
  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PER_DELIVERY_TIMEOUT_MS);

    const resp = await fetch(sub.url, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    statusCode = resp.status;
    const text = await resp.text();
    responseBody = text.length > RESPONSE_BODY_CAP
      ? text.slice(0, RESPONSE_BODY_CAP)
      : text;
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : String(e);
  }

  const duration = Date.now() - started;
  const ok = statusCode !== null && statusCode >= 200 && statusCode < 300;

  await supabase.from("webhook_delivery_attempts").insert({
    delivery_id: delivery.id,
    tenant_id: delivery.tenant_id,
    attempt_number: attemptNumber,
    status_code: statusCode,
    response_body: responseBody,
    error_message: errorMessage,
    duration_ms: duration,
  });

  if (ok) {
    await supabase
      .from("webhook_deliveries")
      .update({
        status: "DELIVERED",
        attempt_count: attemptNumber,
        last_attempt_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);

    await supabase
      .from("webhook_subscriptions")
      .update({
        last_success_at: new Date().toISOString(),
        failure_count: 0,
      })
      .eq("id", sub.id);

    return { id: delivery.id, outcome: "delivered" };
  }

  // Mislukt
  const isDead = attemptNumber >= MAX_ATTEMPTS;
  const backoffSec = BACKOFF_SECONDS[attemptNumber] ?? 12 * 60 * 60;
  const nextAttempt = new Date(Date.now() + backoffSec * 1000).toISOString();

  await supabase
    .from("webhook_deliveries")
    .update({
      status: isDead ? "DEAD" : "PENDING",
      attempt_count: attemptNumber,
      last_attempt_at: new Date().toISOString(),
      next_attempt_at: isDead ? null : nextAttempt,
    })
    .eq("id", delivery.id);

  // Bump failure-teller op subscription; geen automatische circuit-break
  // in v1, alleen counter voor UI.
  const { data: curSub } = await supabase
    .from("webhook_subscriptions")
    .select("failure_count")
    .eq("id", sub.id)
    .single();

  await supabase
    .from("webhook_subscriptions")
    .update({
      last_failure_at: new Date().toISOString(),
      failure_count: ((curSub?.failure_count as number) ?? 0) + 1,
    })
    .eq("id", sub.id);

  return { id: delivery.id, outcome: isDead ? "dead" : "retry" };
}
