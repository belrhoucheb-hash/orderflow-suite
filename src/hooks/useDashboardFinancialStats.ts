import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

export interface DashboardFinancialStats {
  plannedTrips: number;
  totalWeightKg: number;
  activeTotalWeightKg: number;
}

interface RawStats {
  planned_trips: number;
  total_weight_kg: number;
  active_total_weight_kg: number;
}

export function useDashboardFinancialStats() {
  const { tenant } = useTenantOptional();
  return useQuery({
    queryKey: ["dashboard-financial-stats", { tenantId: tenant?.id }],
    staleTime: 30_000,
    queryFn: async (): Promise<DashboardFinancialStats> => {
      const { data, error } = await supabase.rpc("dashboard_financial_stats_v1");
      if (error) throw error;
      const raw = (data ?? {
        planned_trips: 0,
        total_weight_kg: 0,
        active_total_weight_kg: 0,
      }) as RawStats;
      return {
        plannedTrips: raw.planned_trips ?? 0,
        totalWeightKg: Number(raw.total_weight_kg ?? 0),
        activeTotalWeightKg: Number(raw.active_total_weight_kg ?? 0),
      };
    },
  });
}
