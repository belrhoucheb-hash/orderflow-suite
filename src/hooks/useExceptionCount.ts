import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

export interface ExceptionCountBreakdown {
  delivery: number;
  missingData: number;
  sla: number;
  delays: number;
  capacity: number;
  anomalies: number;
}

export interface ExceptionCountSummary {
  total: number;
  breakdown: ExceptionCountBreakdown;
}

const EMPTY_BREAKDOWN: ExceptionCountBreakdown = {
  delivery: 0,
  missingData: 0,
  sla: 0,
  delays: 0,
  capacity: 0,
  anomalies: 0,
};

function normalizeSummary(raw: any): ExceptionCountSummary {
  const breakdown = raw?.breakdown ?? {};
  return {
    total: Number(raw?.total ?? 0),
    breakdown: {
      delivery: Number(breakdown.delivery ?? 0),
      missingData: Number(breakdown.missingData ?? 0),
      sla: Number(breakdown.sla ?? 0),
      delays: Number(breakdown.delays ?? 0),
      capacity: Number(breakdown.capacity ?? 0),
      anomalies: Number(breakdown.anomalies ?? 0),
    },
  };
}

export function useExceptionCount() {
  const { tenant } = useTenantOptional();

  return useQuery({
    queryKey: ["exception-count-summary", tenant?.id],
    enabled: !!tenant?.id,
    refetchInterval: 60_000,
    staleTime: 45_000,
    queryFn: async (): Promise<ExceptionCountSummary> => {
      const { data, error } = await (supabase.rpc as any)("exception_count_summary_v1", {
        p_tenant_id: tenant!.id,
      });

      if (error) throw error;
      return normalizeSummary(data ?? { total: 0, breakdown: EMPTY_BREAKDOWN });
    },
  });
}
