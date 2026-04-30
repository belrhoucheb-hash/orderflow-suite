import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";
import type { DriverAvailability } from "@/hooks/useDriverAvailability";
import type { DriverSchedule } from "@/types/rooster";

export interface PlanningDaySupport {
  driverAvailability: DriverAvailability[];
  schedulesForDate: DriverSchedule[];
  hoursRows: Array<{ driver_id: string; week_start: string; planned_hours: number }>;
}

export function usePlanningDaySupport(date: string | null | undefined, weekStart: string | null | undefined) {
  const { tenant } = useTenantOptional();

  return useQuery<PlanningDaySupport>({
    queryKey: ["planning_day_support", date, weekStart, tenant?.id],
    enabled: !!tenant?.id && !!date && !!weekStart,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("planning_day_support_v1", {
        p_tenant_id: tenant!.id,
        p_date: date,
        p_week_start: weekStart,
      });
      if (error) throw error;

      const raw = data ?? {};
      return {
        driverAvailability: ((raw.driver_availability ?? []) as unknown) as DriverAvailability[],
        schedulesForDate: ((raw.driver_schedules ?? []) as unknown) as DriverSchedule[],
        hoursRows: ((raw.hours_rows ?? []) as unknown) as Array<{
          driver_id: string;
          week_start: string;
          planned_hours: number;
        }>,
      };
    },
  });
}
