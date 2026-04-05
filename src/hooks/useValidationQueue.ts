import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ValidationItem, PipelineAction } from "@/types/pipeline";
import { resolveDecision } from "@/lib/confidenceEngine";
import { executeAction } from "@/lib/pipelineOrchestrator";
import type { SupabaseClient } from "@supabase/supabase-js";

const VALIDATION_QUEUE_KEY = ["validation_queue"] as const;
const VALIDATION_COUNT_KEY = ["validation_queue", "count"] as const;

export function useValidationQueue() {
  return useQuery({
    queryKey: [...VALIDATION_QUEUE_KEY],
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("validation_queue")
        .select("*")
        .eq("status", "PENDING")
        .order("priority", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ValidationItem[];
    },
  });
}

export function useValidationCount() {
  return useQuery({
    queryKey: [...VALIDATION_COUNT_KEY],
    staleTime: 10_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("validation_queue")
        .select("*", { count: "exact", head: true })
        .eq("status", "PENDING");

      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useApproveValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: ValidationItem) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateErr } = await supabase
        .from("validation_queue")
        .update({ status: "APPROVED" })
        .eq("id", item.id);

      if (updateErr) throw updateErr;

      await resolveDecision(supabase, item.decision_log_id, "APPROVED", item.proposed_action, user?.id);

      const action: PipelineAction = {
        tenantId: item.tenant_id,
        entityType: item.entity_type,
        entityId: item.entity_id,
        actionType: item.action_type,
        payload: item.proposed_action,
      };

      await executeAction(supabase as SupabaseClient, action);

      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...VALIDATION_QUEUE_KEY] });
      queryClient.invalidateQueries({ queryKey: [...VALIDATION_COUNT_KEY] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useRejectValidation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (item: ValidationItem) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateErr } = await supabase
        .from("validation_queue")
        .update({ status: "REJECTED" })
        .eq("id", item.id);

      if (updateErr) throw updateErr;

      await resolveDecision(supabase, item.decision_log_id, "REJECTED", undefined, user?.id);

      return item;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...VALIDATION_QUEUE_KEY] });
      queryClient.invalidateQueries({ queryKey: [...VALIDATION_COUNT_KEY] });
    },
  });
}
