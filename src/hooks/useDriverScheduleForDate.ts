import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type { DriverSchedule } from "@/types/rooster";

/**
 * Eén rooster-rij ophalen voor een specifieke (chauffeur, datum)-combinatie.
 * Gebruikt door PlanningVehicleCard om start-time + driver prefill te
 * laten zien op basis van het rooster.
 */
export function useDriverScheduleForDate(driverId: string | null | undefined, date: string | null | undefined) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["driver-schedule-for-date", driverId, date, tenant?.id],
    enabled: !!tenant?.id && !!driverId && !!date,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_schedules" as any)
        .select("*")
        .eq("driver_id", driverId!)
        .eq("date", date!)
        .maybeSingle();
      if (error) throw error;
      return (data as any as DriverSchedule) ?? null;
    },
  });
}

/**
 * Alle rooster-rijen voor één datum. Gebruikt door PlanningVehicleCard
 * voor vehicle-based prefill ("welke chauffeur is ingepland op dit voertuig").
 */
export function useDriverSchedulesForDate(date: string | null | undefined) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["driver-schedules-for-date", date, tenant?.id],
    enabled: !!tenant?.id && !!date,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_schedules" as any)
        .select("*")
        .eq("date", date!);
      if (error) throw error;
      return (data as any as DriverSchedule[]) ?? [];
    },
  });
}
