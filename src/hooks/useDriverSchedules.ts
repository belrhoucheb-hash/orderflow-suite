import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantInsert } from "@/hooks/useTenantInsert";
import { useTenant } from "@/contexts/TenantContext";
import type { DriverSchedule, DriverScheduleUpsert } from "@/types/rooster";
import type { DriverScheduleInput } from "@/lib/validation/driverScheduleSchema";

/**
 * Lijst rooster-rijen tussen twee datums (inclusief). Gebruikt voor de
 * Rooster-dag-, week- en maandweergave.
 */
export function useDriverSchedules(dateFrom: string, dateTo: string) {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();
  const inserter = useTenantInsert("driver_schedules");

  const query = useQuery({
    queryKey: ["driver-schedules", dateFrom, dateTo, tenant?.id],
    staleTime: 10_000,
    enabled: !!tenant?.id && !!dateFrom && !!dateTo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_schedules")
        .select("*")
        .gte("date", dateFrom)
        .lte("date", dateTo)
        .order("date", { ascending: true });
      if (error) throw error;
      return data as DriverSchedule[];
    },
  });

  const upsertSchedule = useMutation({
    mutationFn: async (input: DriverScheduleInput | DriverScheduleUpsert) => {
      const { data, error } = await inserter
        .upsert(input, { onConflict: "tenant_id,driver_id,date" })
        .select()
        .single();
      if (error) throw error;
      return data as DriverSchedule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["driver-schedule-for-date"] });
    },
  });

  const bulkUpsert = useMutation({
    mutationFn: async (rows: DriverScheduleUpsert[]) => {
      if (rows.length === 0) return [];
      const { data, error } = await inserter
        .upsert(rows, { onConflict: "tenant_id,driver_id,date" })
        .select();
      if (error) throw error;
      return data as DriverSchedule[];
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["driver-schedule-for-date"] });
    },
  });

  const deleteSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("driver_schedules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["driver-schedule-for-date"] });
    },
  });

  const deleteRange = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const { error } = await supabase
        .from("driver_schedules")
        .delete()
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["driver-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["driver-schedule-for-date"] });
    },
  });

  return {
    ...query,
    schedules: query.data ?? [],
    upsertSchedule,
    bulkUpsert,
    deleteSchedule,
    deleteRange,
  };
}
