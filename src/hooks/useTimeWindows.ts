// src/hooks/useTimeWindows.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LocationTimeWindow } from "@/types/timeWindows";

export function useTimeWindows(locationId: string | null) {
  return useQuery({
    queryKey: ["location_time_windows", locationId],
    enabled: !!locationId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("location_time_windows")
        .select("*")
        .eq("client_location_id", locationId!)
        .order("day_of_week");
      if (error) throw error;
      return data as LocationTimeWindow[];
    },
  });
}

export function useCreateTimeWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tw: Omit<LocationTimeWindow, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await (supabase as any)
        .from("location_time_windows")
        .insert(tw)
        .select()
        .single();
      if (error) throw error;
      return data as LocationTimeWindow;
    },
    onSuccess: (_data: LocationTimeWindow, variables: Omit<LocationTimeWindow, "id" | "created_at" | "updated_at">) => {
      qc.invalidateQueries({ queryKey: ["location_time_windows", variables.client_location_id] });
    },
  });
}

export function useUpdateTimeWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<LocationTimeWindow> & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("location_time_windows")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as LocationTimeWindow;
    },
    onSuccess: (data: LocationTimeWindow) => {
      qc.invalidateQueries({ queryKey: ["location_time_windows", data.client_location_id] });
    },
  });
}

export function useDeleteTimeWindow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, locationId }: { id: string; locationId: string }) => {
      const { error } = await (supabase as any)
        .from("location_time_windows")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { id, locationId };
    },
    onSuccess: (_data: { id: string; locationId: string }, variables: { id: string; locationId: string }) => {
      qc.invalidateQueries({ queryKey: ["location_time_windows", variables.locationId] });
    },
  });
}
