/**
 * AI Feedback Loop — hooks for the self-improving extraction pipeline.
 *
 * Fetches corrected decisions, builds few-shot examples, and provides
 * per-client accuracy tracking and tenant-wide learning stats.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { buildFewShotExamples } from "@/utils/fewShotBuilder";
import type { AIDecision } from "@/types/confidence";

// ── Query Keys ─────────────────────────────────────────────────

const FEEDBACK_KEYS = {
  examples: (tenantId: string, clientId: string) =>
    ["ai-feedback", "examples", tenantId, clientId] as const,
  clientAccuracy: (tenantId: string, clientId: string) =>
    ["ai-feedback", "client-accuracy", tenantId, clientId] as const,
  tenantLearning: (tenantId: string) =>
    ["ai-feedback", "tenant-learning", tenantId] as const,
};

// ── useFeedbackExamples ────────────────────────────────────────

/**
 * Fetch the last N corrections from ai_decisions where was_corrected=true
 * for a specific client. Returns formatted few-shot prompt text.
 */
export function useFeedbackExamples(clientId: string | null, limit = 10) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: FEEDBACK_KEYS.examples(tenant?.id ?? "", clientId ?? ""),
    enabled: !!tenant?.id && !!clientId,
    staleTime: 120_000,
    queryFn: async () => {
      const decisions = await fetchCorrectedDecisions(
        tenant!.id,
        clientId!,
        limit,
      );
      const prompt = generateFewShotPrompt(decisions);
      return { decisions, prompt };
    },
  });
}

/**
 * Fetch corrected decisions from Supabase for a client.
 * Matches client via the order entity's client_id or client_name.
 */
async function fetchCorrectedDecisions(
  tenantId: string,
  clientId: string,
  limit: number,
): Promise<AIDecision[]> {
  // First, get order IDs for this client
  const { data: clientOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("client_id", clientId)
    .limit(100);

  const orderIds = (clientOrders ?? []).map((o: { id: string }) => o.id);
  if (orderIds.length === 0) return [];

  const { data, error } = await supabase
    .from("ai_decisions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("was_corrected", true)
    .in("entity_id", orderIds)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[useFeedbackExamples] query error:", error.message);
    return [];
  }
  return (data ?? []) as unknown as AIDecision[];
}

/**
 * Convert corrected decisions into a few-shot prompt section.
 */
export function generateFewShotPrompt(decisions: AIDecision[]): string {
  return buildFewShotExamples(decisions);
}

// ── useClientAccuracy ──────────────────────────────────────────

export interface ClientAccuracyPoint {
  period: string;
  totalDecisions: number;
  autoApproved: number;
  corrected: number;
  accuracyPct: number;
}

/**
 * Query ai_decisions to compute accuracy trend (% auto-approved over time)
 * for a specific client, bucketed by week.
 */
export function useClientAccuracy(clientId: string | null) {
  const { tenant } = useTenant();

  return useQuery<ClientAccuracyPoint[]>({
    queryKey: FEEDBACK_KEYS.clientAccuracy(tenant?.id ?? "", clientId ?? ""),
    enabled: !!tenant?.id && !!clientId,
    staleTime: 120_000,
    queryFn: async () => {
      // Get order IDs for this client
      const { data: clientOrders } = await supabase
        .from("orders")
        .select("id")
        .eq("client_id", clientId!)
        .limit(200);

      const orderIds = (clientOrders ?? []).map((o: { id: string }) => o.id);
      if (orderIds.length === 0) return [];

      const { data, error } = await supabase
        .from("ai_decisions")
        .select(
          "was_auto_approved, was_corrected, outcome, created_at",
        )
        .eq("tenant_id", tenant!.id)
        .in("entity_id", orderIds)
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);

      // Bucket by ISO week
      const weekMap = new Map<
        string,
        { total: number; auto: number; corrected: number }
      >();

      for (const row of data ?? []) {
        const wk = getISOWeek(row.created_at);
        const bucket = weekMap.get(wk) ?? {
          total: 0,
          auto: 0,
          corrected: 0,
        };
        bucket.total++;
        if (row.was_auto_approved) bucket.auto++;
        if (row.was_corrected) bucket.corrected++;
        weekMap.set(wk, bucket);
      }

      return Array.from(weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([period, b]) => ({
          period,
          totalDecisions: b.total,
          autoApproved: b.auto,
          corrected: b.corrected,
          accuracyPct:
            b.total > 0
              ? Math.round(((b.total - b.corrected) / b.total) * 10000) / 100
              : 100,
        }));
    },
  });
}

// ── useTenantLearningStats ─────────────────────────────────────

export interface TenantLearningStats {
  avgConfidenceThisWeek: number;
  avgConfidenceLastWeek: number;
  confidenceDelta: number;
  topImprovingClients: Array<{
    clientId: string;
    clientName: string;
    delta: number;
  }>;
  mostCorrectedFields: Array<{
    field: string;
    count: number;
  }>;
}

/**
 * Overall tenant learning: avg confidence this week vs last week,
 * top-improving clients, most-corrected fields.
 */
export function useTenantLearningStats() {
  const { tenant } = useTenant();

  return useQuery<TenantLearningStats>({
    queryKey: FEEDBACK_KEYS.tenantLearning(tenant?.id ?? ""),
    enabled: !!tenant?.id,
    staleTime: 300_000,
    queryFn: async () => {
      const now = new Date();
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - now.getDay());
      thisWeekStart.setHours(0, 0, 0, 0);

      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);

      // Fetch decisions from last 2 weeks
      const { data, error } = await supabase
        .from("ai_decisions")
        .select(
          "confidence_score, was_corrected, correction_summary, entity_id, created_at",
        )
        .eq("tenant_id", tenant!.id)
        .gte("created_at", lastWeekStart.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw new Error(error.message);
      const rows = data ?? [];

      // Split into this week / last week
      const thisWeekRows = rows.filter(
        (r) => new Date(r.created_at) >= thisWeekStart,
      );
      const lastWeekRows = rows.filter(
        (r) =>
          new Date(r.created_at) >= lastWeekStart &&
          new Date(r.created_at) < thisWeekStart,
      );

      const avgConf = (arr: typeof rows) =>
        arr.length > 0
          ? arr.reduce((s, r) => s + Number(r.confidence_score), 0) / arr.length
          : 0;

      const avgConfThisWeek = Math.round(avgConf(thisWeekRows) * 100) / 100;
      const avgConfLastWeek = Math.round(avgConf(lastWeekRows) * 100) / 100;

      // Most corrected fields from correction_summary
      const fieldCounts = new Map<string, number>();
      for (const row of rows) {
        if (!row.was_corrected || !row.correction_summary) continue;
        const summary = row.correction_summary as Record<string, unknown>;
        for (const [key, val] of Object.entries(summary)) {
          if (val === true) {
            // Keys like pickupChanged, deliveryChanged, etc.
            const field = key.replace("Changed", "");
            fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
          }
        }
      }

      const mostCorrectedFields = Array.from(fieldCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([field, count]) => ({ field, count }));

      // Top improving clients — need per-client confidence deltas
      const clientConfMap = new Map<
        string,
        { thisWeek: number[]; lastWeek: number[] }
      >();

      // Get entity_ids to resolve client names
      const entityIds = [...new Set(rows.map((r) => r.entity_id).filter(Boolean))];
      const clientMap = new Map<string, { id: string; name: string }>();

      if (entityIds.length > 0) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, client_id, client_name")
          .in("id", entityIds as string[]);

        for (const o of orders ?? []) {
          if (o.client_id) {
            clientMap.set(o.id, {
              id: o.client_id,
              name: o.client_name ?? o.client_id,
            });
          }
        }
      }

      for (const row of rows) {
        const client = clientMap.get(row.entity_id ?? "");
        if (!client) continue;
        const bucket = clientConfMap.get(client.id) ?? {
          thisWeek: [],
          lastWeek: [],
        };
        if (new Date(row.created_at) >= thisWeekStart) {
          bucket.thisWeek.push(Number(row.confidence_score));
        } else {
          bucket.lastWeek.push(Number(row.confidence_score));
        }
        clientConfMap.set(client.id, bucket);
      }

      const topImprovingClients = Array.from(clientConfMap.entries())
        .filter(([, b]) => b.thisWeek.length > 0 && b.lastWeek.length > 0)
        .map(([clientId, b]) => {
          const twAvg =
            b.thisWeek.reduce((s, v) => s + v, 0) / b.thisWeek.length;
          const lwAvg =
            b.lastWeek.reduce((s, v) => s + v, 0) / b.lastWeek.length;
          const client = [...clientMap.values()].find(
            (c) => c.id === clientId,
          );
          return {
            clientId,
            clientName: client?.name ?? clientId,
            delta: Math.round((twAvg - lwAvg) * 100) / 100,
          };
        })
        .sort((a, b) => b.delta - a.delta)
        .slice(0, 5);

      return {
        avgConfidenceThisWeek: avgConfThisWeek,
        avgConfidenceLastWeek: avgConfLastWeek,
        confidenceDelta:
          Math.round((avgConfThisWeek - avgConfLastWeek) * 100) / 100,
        topImprovingClients,
        mostCorrectedFields,
      };
    },
  });
}

// ── Helpers ────────────────────────────────────────────────────

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) /
      7,
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}
