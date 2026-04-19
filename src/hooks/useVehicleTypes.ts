import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { VehicleType } from "@/types/rateModels";

export function useVehicleTypes() {
  return useQuery<VehicleType[]>({
    queryKey: ["vehicle-types"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as unknown as VehicleType[];
    },
  });
}
