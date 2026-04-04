import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TripCost, CostSource, CostCalculationInput } from "@/types/costModels";
import { calculateTripCosts } from "@/lib/costEngine";

export function useTripCosts(tripId: string | null) {
  return useQuery({
    queryKey: ["trip_costs", tripId],
    enabled: !!tripId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("trip_costs")
        .select("*, cost_types(*)")
        .eq("trip_id", tripId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        cost_type: row.cost_types ?? null,
      })) as TripCost[];
    },
  });
}

export interface CreateTripCostInput {
  tenant_id: string;
  trip_id: string;
  cost_type_id: string;
  amount: number;
  quantity?: number | null;
  rate?: number | null;
  source?: CostSource;
  notes?: string | null;
}

export function useCreateTripCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTripCostInput) => {
      const { data, error } = await (supabase as any).from("trip_costs")
        .insert({
          tenant_id: input.tenant_id,
          trip_id: input.trip_id,
          cost_type_id: input.cost_type_id,
          amount: input.amount,
          quantity: input.quantity ?? null,
          rate: input.rate ?? null,
          source: input.source ?? "HANDMATIG",
          notes: input.notes ?? null,
        }).select().single();
      if (error) throw error;
      return data as TripCost;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["trip_costs", variables.trip_id] });
      toast.success("Rit-kost aangemaakt");
    },
    onError: () => { toast.error("Fout bij aanmaken rit-kost"); },
  });
}

export function useDeleteTripCost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await (supabase as any).from("trip_costs").delete().eq("id", id);
      if (error) throw error;
      return { id, tripId };
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["trip_costs", result.tripId] });
      toast.success("Rit-kost verwijderd");
    },
    onError: () => { toast.error("Fout bij verwijderen rit-kost"); },
  });
}

export interface AutoCalculateInput {
  tripId: string;
  tenantId: string;
  calcInput: CostCalculationInput;
  costTypeMap: Record<string, string>; // cost_type_name -> cost_type_id
}

export function useAutoCalculateTripCosts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tripId, tenantId, calcInput, costTypeMap }: AutoCalculateInput) => {
      // Delete existing AUTO costs for this trip
      const { error: deleteError } = await (supabase as any).from("trip_costs")
        .delete()
        .eq("trip_id", tripId)
        .eq("source", "AUTO");
      if (deleteError) throw deleteError;

      // Calculate new costs
      const breakdown = calculateTripCosts(calcInput);

      // Map and insert new costs
      const inserts = breakdown.items
        .map((item) => {
          const costTypeId = costTypeMap[item.cost_type_name];
          if (!costTypeId) return null;
          return {
            tenant_id: tenantId,
            trip_id: tripId,
            cost_type_id: costTypeId,
            amount: item.amount,
            quantity: null,
            rate: null,
            source: "AUTO" as CostSource,
            notes: null,
          };
        })
        .filter(Boolean);

      if (inserts.length > 0) {
        const { error: insertError } = await (supabase as any).from("trip_costs").insert(inserts);
        if (insertError) throw insertError;
      }

      return breakdown;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ["trip_costs", variables.tripId] });
      toast.success("Ritkosten automatisch berekend");
    },
    onError: () => { toast.error("Fout bij automatisch berekenen ritkosten"); },
  });
}
