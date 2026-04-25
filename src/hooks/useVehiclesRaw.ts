import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Rauwe vehicles-rijen, inclusief echte UUID als `id`. `useVehicles()` mapt `id`
 * naar `code` (voor drag-and-drop-planning), maar voor tabellen die de
 * database-UUID nodig hebben (zoals `driver_schedules.vehicle_id`) gebruik je
 * deze hook.
 */
export interface RawVehicle {
  id: string; // UUID
  code: string;
  plate: string;
  name: string;
  type: string | null;
  is_active: boolean;
}

export function useVehiclesRaw(options?: { includeInactive?: boolean }) {
  const includeInactive = options?.includeInactive ?? false;
  return useQuery({
    queryKey: ["vehicles-raw", { includeInactive }],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("vehicles")
        .select("id, code, plate, name, type, is_active")
        .order("code", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as RawVehicle[];
    },
  });
}
