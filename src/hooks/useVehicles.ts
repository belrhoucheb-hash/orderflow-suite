import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FleetVehicle {
  id: string;
  dbId?: string;
  code: string;
  name: string;
  plate: string;
  type: string;
  capacityKg: number;
  capacityPallets: number;
  features: string[];
}

export function useVehicles() {
  return useQuery({
    queryKey: ["vehicles"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicles")
        .select("id, code, name, plate, type, capacity_kg, capacity_pallets, features")
        .eq("is_active", true)
        .order("capacity_kg", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((v) => ({
        id: v.code,
        dbId: v.id,
        code: v.code,
        name: v.name,
        plate: v.plate,
        type: v.type,
        capacityKg: v.capacity_kg,
        capacityPallets: v.capacity_pallets,
        features: v.features ?? [],
      })) as FleetVehicle[];
    },
  });
}
