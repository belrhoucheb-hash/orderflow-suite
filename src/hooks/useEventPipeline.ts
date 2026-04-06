import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type { OrderEvent, EventType, ActorType } from "@/types/events";
import { EVENT_PHASE_ORDER } from "@/types/events";

// ─── Emit a single event ────────────────────────────────────────
export function useEmitEvent() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({
      orderId,
      eventType,
      eventData = {},
      actorType = "system",
      actorId,
      confidenceScore,
    }: {
      orderId: string;
      eventType: EventType;
      eventData?: Record<string, unknown>;
      actorType?: ActorType;
      actorId?: string | null;
      confidenceScore?: number | null;
    }) => {
      // Fetch the last event for this order to calculate duration
      const { data: lastEvent } = await (supabase as any)
        .from("order_events")
        .select("created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let durationSincePreviousMs: number | null = null;
      if (lastEvent?.created_at) {
        durationSincePreviousMs = Date.now() - new Date(lastEvent.created_at).getTime();
      }

      const tenantId = tenant?.id || null;

      const { data, error } = await (supabase as any)
        .from("order_events")
        .insert({
          tenant_id: tenantId,
          order_id: orderId,
          event_type: eventType,
          event_data: eventData,
          actor_type: actorType,
          actor_id: actorId ?? null,
          confidence_score: confidenceScore ?? null,
          duration_since_previous_ms: durationSincePreviousMs,
        })
        .select()
        .single();

      if (error) throw error;
      return data as OrderEvent;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["order-events", variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-stats"] });
    },
  });
}

// ─── Fire-and-forget emit (no hook needed) ──────────────────────
export async function emitEventDirect(
  orderId: string,
  eventType: EventType,
  options?: {
    eventData?: Record<string, unknown>;
    actorType?: ActorType;
    actorId?: string | null;
    confidenceScore?: number | null;
    tenantId?: string | null;
  },
): Promise<void> {
  try {
    const { data: lastEvent } = await (supabase as any)
      .from("order_events")
      .select("created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let durationSincePreviousMs: number | null = null;
    if (lastEvent?.created_at) {
      durationSincePreviousMs = Date.now() - new Date(lastEvent.created_at).getTime();
    }

    await (supabase as any).from("order_events").insert({
      tenant_id: options?.tenantId ?? null,
      order_id: orderId,
      event_type: eventType,
      event_data: options?.eventData ?? {},
      actor_type: options?.actorType ?? "system",
      actor_id: options?.actorId ?? null,
      confidence_score: options?.confidenceScore ?? null,
      duration_since_previous_ms: durationSincePreviousMs,
    });
  } catch (e) {
    // Fire-and-forget — log but don't throw
    console.error("[EventPipeline] Failed to emit event:", eventType, e);
  }
}

// ─── Timeline for a single order ────────────────────────────────
export function useOrderTimeline(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ["order-events", orderId],
    staleTime: 10_000,
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await (supabase as any)
        .from("order_events")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as OrderEvent[];
    },
    enabled: !!orderId,
  });
}

// ─── Duration per phase ─────────────────────────────────────────
export interface PhaseDuration {
  from: EventType;
  to: EventType;
  durationMs: number;
}

export function useOrderDurations(orderId: string | null | undefined) {
  const { data: events = [], ...rest } = useOrderTimeline(orderId);

  const durations: PhaseDuration[] = [];
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    const ms = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
    durations.push({
      from: prev.event_type,
      to: curr.event_type,
      durationMs: ms,
    });
  }

  return { durations, events, ...rest };
}

// ─── Pipeline-wide stats ────────────────────────────────────────
export interface PhaseStats {
  phase: string;
  avgDurationMs: number;
  count: number;
}

export function usePipelineStats(days: number = 30) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["pipeline-stats", days, tenant?.id],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await (supabase as any)
        .from("order_events")
        .select("order_id, event_type, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return { phases: [] as PhaseStats[], bottleneck: null as string | null };

      return computePipelineStats(data as OrderEvent[]);
    },
    enabled: !!tenant?.id,
  });
}

/** Pure function for computing pipeline stats — testable without Supabase */
export function computePipelineStats(events: Pick<OrderEvent, "order_id" | "event_type" | "created_at">[]): {
  phases: PhaseStats[];
  bottleneck: string | null;
} {
  // Group events by order
  const byOrder = new Map<string, typeof events>();
  for (const e of events) {
    const list = byOrder.get(e.order_id) || [];
    list.push(e);
    byOrder.set(e.order_id, list);
  }

  // Collect durations per phase transition
  const phaseMap = new Map<string, number[]>();

  for (const [, orderEvents] of byOrder) {
    // Sort chronologically
    const sorted = [...orderEvents].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const key = `${prev.event_type} -> ${curr.event_type}`;
      const ms = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
      const list = phaseMap.get(key) || [];
      list.push(ms);
      phaseMap.set(key, list);
    }
  }

  const phases: PhaseStats[] = [];
  for (const [phase, durations] of phaseMap) {
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
    phases.push({ phase, avgDurationMs: avg, count: durations.length });
  }

  // Sort by avg descending to find bottleneck
  phases.sort((a, b) => b.avgDurationMs - a.avgDurationMs);
  const bottleneck = phases.length > 0 ? phases[0].phase : null;

  return { phases, bottleneck };
}
