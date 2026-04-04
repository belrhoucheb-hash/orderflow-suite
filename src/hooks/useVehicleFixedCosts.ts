import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromTable } from "@/lib/supabaseHelpers";
import { toast } from "sonner";
import type { VehicleFixedCost } from "@/types/costModels";

export function useVehicleFixedCosts(vehicleId: string | null) {
  return useQuery({
    queryKey: ["vehicle_fixed_costs", vehicleId],
    enabled: !!vehicleId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await fromTable("vehicle_fixed_costs")
        .select("*, cost_types(*)")
        .eq("vehicle_id", vehicleId!)
        .order("valid_from", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        cost_type: row.cost_types ?? null,
      })) as VehicleFixedCost[];
    },
  });
}

export function useVehicleMonthlyTotal(vehicleId: string | null) {
  const query = useVehicleFixedCosts(vehicleId);
  const today = new Date().toISOString().split("T")[0];

  const total = (query.data ?? [])
    .filter((cost) => {
      const fromOk = !cost.valid_from || cost.valid_from <= today;
      const untilOk = !cost.valid_until || cost.valid_until >= today;
      return fromOk && untilOk;
    })
    .reduce((sum, cost) => sum + cost.monthly_amount, 0);

  return { ...query, total };
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateVehicleFixedCostInput) => {
      const { data, error } = await fromTable("vehicle_fixed_costs")
        .insert({
          tenant_id: input.tenant_id,
          vehicle_id: input.vehicle_id,
          cost_type_id: input.cost_type_id,
          monthly_amount: input.monthly_amount,
          valid_from: input.valid_from ?? null,
          valid_until: input.valid_until ?? null,
        }).select().single();
      if (error) throw error;
      return data as VehicleFixedCost;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["vehicle_fixed_costs", variables.vehicle_id] });
      toast.success("Vaste voertuigkost aangemaakt");
    },
    onError: () => { toast.error("Fout bij aanmaken vaste voertuigkost"); },
  });
}

export function useUpdateVehicleFixedCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, vehicleId, updates }: { id: string; vehicleId: string; updates: Partial<CreateVehicleFixedCostInput> }) => {
      const { data, error } = await fromTable("vehicle_fixed_costs")
        .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data as VehicleFixedCost;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["vehicle_fixed_costs", variables.vehicleId] });
      toast.success("Vaste voertuigkost bijgewerkt");
    },
    onError: () => { toast.error("Fout bij bijwerken vaste voertuigkost"); },
  });
}

export function useDeleteVehicleFixedCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, vehicleId }: { id: string; vehicleId: string }) => {
      const { error } = await fromTable("vehicle_fixed_costs").delete().eq("id", id);
      if (error) throw error;
      return { id, vehicleId };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["vehicle_fixed_costs", result.vehicleId] });
      toast.success("Vaste voertuigkost verwijderd");
    },
    onError: () => { toast.error("Fout bij verwijderen vaste voertuigkost"); },
  });
}
