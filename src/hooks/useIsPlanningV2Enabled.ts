import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

/**
 * Leest tenant_settings.planning.v2_enabled. Default false zodat het oude
 * planbord (/planning) blijft draaien voor tenants die nog niet gemigreerd
 * zijn.
 */
export function useIsPlanningV2Enabled() {
  const { tenant } = useTenantOptional();
  return useQuery({
    queryKey: ["planning_v2_enabled", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("is_planning_v2_enabled", { p_tenant_id: tenant!.id });
      if (error) throw error;
      return !!data;
    },
  });
}

export function usePlanningClusterGranularity() {
  const { tenant } = useTenantOptional();
  return useQuery({
    queryKey: ["planning_cluster_granularity", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_planning_cluster_granularity", { p_tenant_id: tenant!.id });
      if (error) throw error;
      return (data as string) ?? "PC2";
    },
  });
}
