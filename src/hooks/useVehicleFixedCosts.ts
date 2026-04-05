import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { VehicleFixedCost } from "@/types/costModels";

export function useVehicleFixedCosts(vehicleId: string | null) {
  return useQuery({
    queryKey: ["vehicle_fixed_costs", vehicleId],
    enabled: !!vehicleId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_fixed_costs" as any)
        .select("*, cost_types(*)")
        .eq("vehicle_id", vehicleId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []).map((vfc: any) => ({
        ...vfc,
        cost_type: vfc.cost_types ?? null,
      })) as VehicleFixedCost[];
    },
  });
}

/**
 * Get total monthly fixed costs for a vehicle.
 */
export function useVehicleMonthlyTotal(vehicleId: string | null) {
  const { data: costs, ...rest } = useVehicleFixedCosts(vehicleId);

  const today = new Date().toISOString().split("T")[0];
  const activeCosts = (costs ?? []).filter((c) => {
    if (c.valid_from && c.valid_from > today) return false;
    if (c.valid_until && c.valid_until < today) return false;
    return true;
  });

  const monthlyTotal = activeCosts.reduce((sum, c) => sum + c.monthly_amount, 0);

  return { ...rest, data: { costs: activeCosts, monthlyTotal } };
}

export interface CreateVehicleFixedCostInput {
  tenant_id: string;
  vehicle_id: string;
  cost_type_id: string;
  monthly_amount: number;
  valid_from?: string | null;
  valid_until?: string | null;
}

export function useCreateVehicleFixedCost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateVehicleFixedCostInput) => {
      const { data, error } = await supabase
        .from("vehicle_fixed_costs" as any)
        .insert({
          tenant_id: input.tenant_id,
          vehicle_id: input.vehicle_id,
          cost_type_id: input.cost_type_id,
          monthly_amount: input.monthly_amount,
          valid_from: input.valid_from ?? null,
          valid_until: input.valid_until ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as VehicleFixedCost;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_fixed_costs", variables.vehicle_id] });
      toast.success("Vaste kosten toegevoegd");
    },
    onError: () => {
      toast.error("Fout bij toevoegen vaste kosten");
    },
  });
}

export function useUpdateVehicleFixedCost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, vehicleId, updates }: { id: string; vehicleId: string; updates: Partial<CreateVehicleFixedCostInput> }) => {
      const { data, error } = await supabase
        .from("vehicle_fixed_costs" as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return { data: data as VehicleFixedCost, vehicleId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_fixed_costs", result.vehicleId] });
      toast.success("Vaste kosten bijgewerkt");
    },
    onError: () => {
      toast.error("Fout bij bijwerken vaste kosten");
    },
  });
}

export function useDeleteVehicleFixedCost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, vehicleId }: { id: string; vehicleId: string }) => {
      const { error } = await supabase
        .from("vehicle_fixed_costs" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      return vehicleId;
    },
    onSuccess: (vehicleId) => {
      queryClient.invalidateQueries({ queryKey: ["vehicle_fixed_costs", vehicleId] });
      toast.success("Vaste kosten verwijderd");
    },
    onError: () => {
      toast.error("Fout bij verwijderen vaste kosten");
    },
  });
}
