// Hooks voor de connector-thresholds-tabel. Per-tenant en per-provider
// configureerbare grenzen voor max-failures-per-window en max-latency.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export interface ConnectorThreshold {
  tenant_id: string;
  provider: string;
  max_failures: number;
  window_minutes: number;
  max_latency_ms: number;
  notify_planner: boolean;
  updated_at: string;
}

export const DEFAULT_THRESHOLD: Omit<ConnectorThreshold, "tenant_id" | "provider" | "updated_at"> = {
  max_failures: 5,
  window_minutes: 5,
  max_latency_ms: 1500,
  notify_planner: true,
};

export function useConnectorThreshold(provider: string) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["connector_thresholds", tenant?.id, provider],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async (): Promise<ConnectorThreshold> => {
      const { data, error } = await supabase
        .from("connector_thresholds" as never)
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("provider", provider)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      const row = data as Partial<ConnectorThreshold> | null;
      return {
        tenant_id: tenant!.id,
        provider,
        max_failures: row?.max_failures ?? DEFAULT_THRESHOLD.max_failures,
        window_minutes: row?.window_minutes ?? DEFAULT_THRESHOLD.window_minutes,
        max_latency_ms: row?.max_latency_ms ?? DEFAULT_THRESHOLD.max_latency_ms,
        notify_planner: row?.notify_planner ?? DEFAULT_THRESHOLD.notify_planner,
        updated_at: row?.updated_at ?? new Date().toISOString(),
      };
    },
  });
}

export function useSaveConnectorThreshold(provider: string) {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ConnectorThreshold>) => {
      if (!tenant?.id) throw new Error("Geen tenant");
      const row = {
        tenant_id: tenant.id,
        provider,
        max_failures: input.max_failures ?? DEFAULT_THRESHOLD.max_failures,
        window_minutes: input.window_minutes ?? DEFAULT_THRESHOLD.window_minutes,
        max_latency_ms: input.max_latency_ms ?? DEFAULT_THRESHOLD.max_latency_ms,
        notify_planner: input.notify_planner ?? DEFAULT_THRESHOLD.notify_planner,
      };
      const { error } = await supabase
        .from("connector_thresholds" as never)
        .upsert(row as never, { onConflict: "tenant_id,provider" });
      if (error) throw error;
      // Audit-trail log van de threshold-wijziging.
      try {
        await supabase.from("connector_audit_log" as never).insert({
          tenant_id: tenant.id,
          provider,
          action: "threshold_change",
          details: row,
        } as never);
      } catch {
        // audit-log is best-effort, primaire flow mag niet crashen
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["connector_thresholds"] });
      qc.invalidateQueries({ queryKey: ["connector_audit_log"] });
    },
  });
}
