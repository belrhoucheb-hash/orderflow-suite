import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

export interface DashboardForecastStats {
  plannedOrInTransit: number;
  activeOrderCount: number;
  activeTotalWeightKg: number;
}

interface RawStats {
  planned_or_in_transit: number;
  active_order_count: number;
  active_total_weight_kg: number;
}

export function useDashboardForecastStats() {
  const { tenant } = useTenantOptional();
  return useQuery({
    queryKey: ["dashboard-forecast-stats", { tenantId: tenant?.id }],
    staleTime: 30_000,
    queryFn: async (): Promise<DashboardForecastStats> => {
      const { data, error } = await supabase.rpc("dashboard_forecast_stats_v1");
      if (error) throw error;
      const raw = (data ?? {
        planned_or_in_transit: 0,
        active_order_count: 0,
        active_total_weight_kg: 0,
      }) as RawStats;
      return {
        plannedOrInTransit: raw.planned_or_in_transit ?? 0,
        activeOrderCount: raw.active_order_count ?? 0,
        activeTotalWeightKg: Number(raw.active_total_weight_kg ?? 0),
      };
    },
  });
}
