import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

export interface DashboardStats {
  total: number;
  byStatus: Record<string, number>;
  overdue: number;
  totalWeightKg: number;
  spoed: number;
  inTransit: number;
  plannedOrInTransit: number;
  delivered: number;
  nieuw: number;
}

interface RawStats {
  total: number;
  by_status: Record<string, number>;
  overdue: number;
  total_weight_kg: number;
  spoed: number;
  in_transit: number;
  planned_or_in_transit: number;
  delivered: number;
  nieuw: number;
}

export function useDashboardStats() {
  const { tenant } = useTenantOptional();
  return useQuery({
    queryKey: ["dashboard-stats", { tenantId: tenant?.id }],
    staleTime: 30_000,
    queryFn: async (): Promise<DashboardStats> => {
      const { data, error } = await supabase.rpc("dashboard_stats_v1");
      if (error) throw error;
      const raw = (data ?? {
        total: 0, by_status: {}, overdue: 0, total_weight_kg: 0,
        spoed: 0, in_transit: 0, planned_or_in_transit: 0, delivered: 0, nieuw: 0,
      }) as RawStats;
      return {
        total: raw.total ?? 0,
        byStatus: raw.by_status ?? {},
        overdue: raw.overdue ?? 0,
        totalWeightKg: Number(raw.total_weight_kg ?? 0),
        spoed: raw.spoed ?? 0,
        inTransit: raw.in_transit ?? 0,
        plannedOrInTransit: raw.planned_or_in_transit ?? 0,
        delivered: raw.delivered ?? 0,
        nieuw: raw.nieuw ?? 0,
      };
    },
  });
}
