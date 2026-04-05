import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import {
  recordDecision,
  resolveDecision,
} from "@/lib/confidenceEngine";
import type {
  DecisionType,
  Resolution,
  DecisionLogEntry,
  ConfidenceScore,
  RecordDecisionInput,
} from "@/types/confidence";

// ─── Query Keys ─────────────────────────────────────────────

const CONFIDENCE_KEYS = {
  all: ["confidence"] as const,
  scores: (tenantId: string, decisionType?: DecisionType) =>
    ["confidence", "scores", tenantId, decisionType] as const,
  log: (entityId: string) =>
    ["confidence", "log", entityId] as const,
};

// ─── useConfidenceScores ────────────────────────────────────

export function useConfidenceScores(decisionType?: DecisionType) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: CONFIDENCE_KEYS.scores(tenant?.id ?? "", decisionType),
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from("confidence_scores")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("decision_type");

      if (decisionType) {
        query = query.eq("decision_type", decisionType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ConfidenceScore[];
    },
  });
}

// ─── useDecisionLog ─────────────────────────────────────────

export function useDecisionLog(entityId: string) {
  return useQuery({
    queryKey: CONFIDENCE_KEYS.log(entityId),
    enabled: !!entityId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decision_log")
        .select("*")
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as DecisionLogEntry[];
    },
  });
}

// ─── useRecordDecision ──────────────────────────────────────

export function useRecordDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RecordDecisionInput) => {
      return recordDecision(supabase, params);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: CONFIDENCE_KEYS.log(variables.entityId),
      });
    },
  });
}

// ─── useResolveDecision ─────────────────────────────────────

export function useResolveDecision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      decisionId: string;
      resolution: Resolution;
      actualAction?: Record<string, unknown>;
    }) => {
      return resolveDecision(
        supabase,
        params.decisionId,
        params.resolution,
        params.actualAction
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONFIDENCE_KEYS.all });
    },
  });
}
