import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type {
  AIDecision,
  AIDecisionType,
  DecisionOutcome,
  RecordAIDecisionInput,
  ResolveAIDecisionInput,
  DecisionStats,
  LearningCurvePoint,
} from "@/types/confidence";

// ─── Query Keys ─────────────────────────────────────────────

const CS_KEYS = {
  all: ["confidence-store"] as const,
  decisions: (tenantId: string) =>
    ["confidence-store", "decisions", tenantId] as const,
  stats: (tenantId: string, decisionType: string, days: number) =>
    ["confidence-store", "stats", tenantId, decisionType, days] as const,
  learningCurve: (tenantId: string, clientId: string) =>
    ["confidence-store", "learning-curve", tenantId, clientId] as const,
  automationRate: (tenantId: string) =>
    ["confidence-store", "automation-rate", tenantId] as const,
};

// ─── recordDecision ─────────────────────────────────────────

export async function recordAIDecision(
  params: RecordAIDecisionInput
): Promise<AIDecision> {
  const { data, error } = await supabase
    .from("ai_decisions")
    .insert({
      tenant_id: params.tenantId,
      decision_type: params.decisionType,
      entity_id: params.entityId ?? null,
      entity_type: params.entityType ?? null,
      confidence_score: params.confidenceScore,
      field_confidences: params.fieldConfidences ?? {},
      ai_suggestion: params.aiSuggestion,
      was_auto_approved: params.wasAutoApproved ?? false,
      processing_time_ms: params.processingTimeMs ?? null,
      model_version: params.modelVersion ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as AIDecision;
}

// ─── resolveDecision ────────────────────────────────────────

export async function resolveAIDecision(
  params: ResolveAIDecisionInput
): Promise<void> {
  const wasCorrected = params.outcome === "corrected";

  const { error } = await supabase
    .from("ai_decisions")
    .update({
      outcome: params.outcome,
      final_values: params.finalValues ?? null,
      was_corrected: wasCorrected,
      correction_summary: params.correctionSummary ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", params.decisionId);

  if (error) throw new Error(error.message);
}

// ─── React Hooks ────────────────────────────────────────────

export function useRecordAIDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: recordAIDecision,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CS_KEYS.all });
    },
  });
}

export function useResolveAIDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: resolveAIDecision,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CS_KEYS.all });
    },
  });
}

/**
 * Query aggregated stats for a decision type over the last N days.
 */
export function useDecisionStats(decisionType: AIDecisionType, days = 30) {
  const { tenant } = useTenant();

  return useQuery<DecisionStats>({
    queryKey: CS_KEYS.stats(tenant?.id ?? "", decisionType, days),
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await supabase
        .from("ai_decisions")
        .select("confidence_score, outcome, was_auto_approved")
        .eq("tenant_id", tenant!.id)
        .eq("decision_type", decisionType)
        .gte("created_at", since.toISOString());

      if (error) throw new Error(error.message);

      const rows = data ?? [];
      const total = rows.length;
      const autoApproved = rows.filter((r) => r.was_auto_approved).length;
      const corrected = rows.filter((r) => r.outcome === "corrected").length;
      const rejected = rows.filter((r) => r.outcome === "rejected").length;
      const avgConf =
        total > 0
          ? rows.reduce((sum, r) => sum + Number(r.confidence_score), 0) / total
          : 0;
      const automationRate = total > 0 ? (autoApproved / total) * 100 : 0;

      return {
        totalDecisions: total,
        autoApprovedCount: autoApproved,
        correctedCount: corrected,
        rejectedCount: rejected,
        avgConfidence: Math.round(avgConf * 100) / 100,
        automationRate: Math.round(automationRate * 100) / 100,
      };
    },
  });
}

/**
 * Query confidence improvement over time for a specific client.
 */
export function useClientLearningCurve(clientId: string | null) {
  const { tenant } = useTenant();

  return useQuery<LearningCurvePoint[]>({
    queryKey: CS_KEYS.learningCurve(tenant?.id ?? "", clientId ?? ""),
    enabled: !!tenant?.id && !!clientId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("confidence_metrics")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("client_id", clientId!)
        .order("period_start", { ascending: true });

      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => ({
        period: row.period_start as string,
        avgConfidence: Number(row.avg_confidence) || 0,
        automationRate: Number(row.automation_rate) || 0,
        totalDecisions: Number(row.total_decisions) || 0,
      }));
    },
  });
}

/**
 * Current automation % across all decision types for the tenant.
 */
export function useAutomationRate() {
  const { tenant } = useTenant();

  return useQuery<number>({
    queryKey: CS_KEYS.automationRate(tenant?.id ?? ""),
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_decisions")
        .select("was_auto_approved")
        .eq("tenant_id", tenant!.id);

      if (error) throw new Error(error.message);

      const rows = data ?? [];
      if (rows.length === 0) return 0;

      const autoApproved = rows.filter((r) => r.was_auto_approved).length;
      return Math.round((autoApproved / rows.length) * 10000) / 100;
    },
  });
}
