import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DriverAvailabilityStatus = "werkt" | "verlof" | "ziek" | "rust" | "afwezig";

export interface DriverAvailability {
  id: string;
  tenant_id: string;
  driver_id: string;
  date: string;
  status: DriverAvailabilityStatus;
  hours_available: number | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface DriverAvailabilityUpsert {
  tenant_id: string;
  driver_id: string;
  date: string;
  status: DriverAvailabilityStatus;
  hours_available?: number | null;
  reason?: string | null;
}

export function useDriverAvailability(date: string | null) {
  return useQuery({
    queryKey: ["driver_availability", date],
    enabled: !!date,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_availability" as any)
        .select("*")
        .eq("date", date!);
      if (error) throw error;
      return data as any as DriverAvailability[];
    },
  });
}

export function useDriverAvailabilityRange(fromDate: string | null, toDate: string | null) {
  return useQuery({
    queryKey: ["driver_availability_range", fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_availability" as any)
        .select("*")
        .gte("date", fromDate!)
        .lte("date", toDate!)
        .order("date");
      if (error) throw error;
      return data as any as DriverAvailability[];
    },
  });
}

export function useUpsertDriverAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: DriverAvailabilityUpsert) => {
      const { data, error } = await supabase
        .from("driver_availability" as any)
        .upsert(row, { onConflict: "tenant_id,driver_id,date" })
        .select()
        .single();
      if (error) throw error;
      return data as any as DriverAvailability;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["driver_availability", row.date] });
      qc.invalidateQueries({ queryKey: ["driver_availability_range"] });
    },
  });
}

export function useBulkUpsertDriverAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: DriverAvailabilityUpsert[]) => {
      if (rows.length === 0) return [];
      const { data, error } = await supabase
        .from("driver_availability" as any)
        .upsert(rows, { onConflict: "tenant_id,driver_id,date" })
        .select();
      if (error) throw error;
      return data as any as DriverAvailability[];
    },
    onSuccess: (_data, variables) => {
      const dates = new Set(variables.map((r) => r.date));
      dates.forEach((d) => qc.invalidateQueries({ queryKey: ["driver_availability", d] }));
      qc.invalidateQueries({ queryKey: ["driver_availability_range"] });
    },
  });
}
