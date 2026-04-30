import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VehicleType } from "@/types/rateModels";

export function useVehicleTypes() {
  return useQuery<VehicleType[]>({
    queryKey: ["vehicle-types"],
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("id, tenant_id, code, name, sort_order, max_length_cm, max_width_cm, max_height_cm, max_weight_kg, max_volume_m3, max_pallets, has_tailgate, has_cooling, adr_capable, is_active, created_at, updated_at")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as VehicleType[];
    },
  });
}
