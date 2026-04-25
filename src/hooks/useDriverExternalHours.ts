import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function useDriverExternalHoursThisWeek(provider = "nostradamus") {
  const { tenant } = useTenantOptional();
  const weekStart = useMemo(
    () => formatIsoDate(startOfWeek(new Date(), { weekStartsOn: 1 })),
    [],
  );

  const query = useQuery({
    queryKey: ["driver_actual_hours_per_week", provider, weekStart, tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("driver_actual_hours_per_week" as any) as any)
        .select("driver_id, actual_hours")
        .eq("tenant_id", tenant!.id)
        .eq("provider", provider)
        .eq("week_start", weekStart);
      if (error) throw error;
      return (data ?? []) as Array<{ driver_id: string; actual_hours: number | null }>;
    },
  });

  const hoursByDriver = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of query.data ?? []) {
      if (row.driver_id) map.set(row.driver_id, Number(row.actual_hours ?? 0));
    }
    return map;
  }, [query.data]);

  return {
    ...query,
    weekStart,
    hoursByDriver,
  };
}
