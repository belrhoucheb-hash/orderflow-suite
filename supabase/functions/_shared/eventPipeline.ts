/**
 * Event Pipeline — shared helper for Supabase Edge Functions.
 *
 * Inserts events into the `order_events` table so that every
 * significant lifecycle event is tracked for audit, SLA, and
 * pipeline analytics.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// ── Types (mirror src/types/events.ts, kept minimal for Deno) ──

export type EventType =
  | "email_received"
  | "ai_extraction_started"
  | "ai_extraction_completed"
  | "planner_review_started"
  | "planner_approved"
  | "planner_corrected"
  | "order_planned"
  | "trip_created"
  | "trip_dispatched"
  | "stop_arrived"
  | "stop_completed"
  | "pod_uploaded"
  | "order_delivered"
  | "invoice_generated"
  | "invoice_sent"
  | "invoice_paid"
  | "exception_raised"
  | "exception_resolved";

export type ActorType = "system" | "ai" | "planner" | "chauffeur" | "client";

export interface EmitEventParams {
  tenantId?: string | null;
  orderId: string;
  eventType: EventType;
  eventData?: Record<string, unknown>;
  actorType?: ActorType;
  actorId?: string | null;
  confidenceScore?: number | null;
}

// ── Emit an order event ────────────────────────────────────────

export async function emitOrderEvent(
  supabase: SupabaseClient,
  params: EmitEventParams,
): Promise<void> {
  try {
    // Calculate duration since previous event for this order
    let durationSincePreviousMs: number | null = null;

    const { data: lastEvent } = await supabase
      .from("order_events")
      .select("created_at")
      .eq("order_id", params.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastEvent?.created_at) {
      durationSincePreviousMs =
        Date.now() - new Date(lastEvent.created_at).getTime();
    }

    const { error } = await supabase.from("order_events").insert({
      tenant_id: params.tenantId ?? null,
      order_id: params.orderId,
      event_type: params.eventType,
      event_data: params.eventData ?? {},
      actor_type: params.actorType ?? "system",
      actor_id: params.actorId ?? null,
      confidence_score: params.confidenceScore ?? null,
      duration_since_previous_ms: durationSincePreviousMs,
    });

    if (error) {
      console.error("[eventPipeline] insert error:", error.message);
    }
  } catch (e) {
    // Fire-and-forget — log but don't throw
    console.error("[eventPipeline] unexpected error:", e);
  }
}
