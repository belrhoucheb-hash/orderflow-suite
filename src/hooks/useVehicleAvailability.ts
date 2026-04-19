import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VehicleAvailabilityStatus = "beschikbaar" | "niet_beschikbaar" | "onderhoud" | "defect";

export interface VehicleAvailability {
  id: string;
  tenant_id: string;
  vehicle_id: string;
  date: string;
  status: string;
  reason: string | null;
  created_at: string;
}

export interface VehicleAvailabilityUpsert {
  tenant_id: string;
  vehicle_id: string;
  date: string;
  status: VehicleAvailabilityStatus;
  reason?: string | null;
}

export function useVehicleAvailability(date: string | null) {
  return useQuery({
    queryKey: ["vehicle_availability", date],
    enabled: !!date,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_availability" as any)
        .select("*")
        .eq("date", date!);
      if (error) throw error;
      return data as any as VehicleAvailability[];
    },
  });
}

export function useUpsertVehicleAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: VehicleAvailabilityUpsert) => {
      const { data, error } = await supabase
        .from("vehicle_availability" as any)
        .upsert(row, { onConflict: "vehicle_id,date" })
        .select()
        .single();
      if (error) throw error;
      return data as any as VehicleAvailability;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["vehicle_availability", row.date] });
    },
  });
}

export function useBulkUpsertVehicleAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: VehicleAvailabilityUpsert[]) => {
      if (rows.length === 0) return [];
      const { data, error } = await supabase
        .from("vehicle_availability" as any)
        .upsert(rows, { onConflict: "vehicle_id,date" })
        .select();
      if (error) throw error;
      return data as any as VehicleAvailability[];
    },
    onSuccess: (_data, variables) => {
      const dates = new Set(variables.map((r) => r.date));
      dates.forEach((d) => qc.invalidateQueries({ queryKey: ["vehicle_availability", d] }));
    },
  });
}
