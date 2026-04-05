import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TripCost, CostSource } from "@/types/costModels";
import { calculateTripCosts } from "@/lib/costEngine";
import type { CostCalculationInput } from "@/types/costModels";

export function useTripCosts(tripId: string | null) {
  return useQuery({
    queryKey: ["trip_costs", tripId],
    enabled: !!tripId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trip_costs" as any)
        .select("*, cost_types(*)")
        .eq("trip_id", tripId!)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((tc: any) => ({
        ...tc,
        cost_type: tc.cost_types ?? null,
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTripCostInput) => {
      const { data, error } = await supabase
        .from("trip_costs" as any)
        .insert({
          tenant_id: input.tenant_id,
          trip_id: input.trip_id,
          cost_type_id: input.cost_type_id,
          amount: input.amount,
          quantity: input.quantity ?? null,
          rate: input.rate ?? null,
          source: input.source ?? "HANDMATIG",
          notes: input.notes ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as TripCost;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["trip_costs", variables.trip_id] });
      toast.success("Kosten toegevoegd");
    },
    onError: () => {
      toast.error("Fout bij toevoegen kosten");
    },
  });
}

export function useDeleteTripCost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, tripId }: { id: string; tripId: string }) => {
      const { error } = await supabase
        .from("trip_costs" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      return tripId;
    },
    onSuccess: (tripId) => {
      queryClient.invalidateQueries({ queryKey: ["trip_costs", tripId] });
      toast.success("Kosten verwijderd");
    },
    onError: () => {
      toast.error("Fout bij verwijderen kosten");
    },
  });
}

/**
 * Auto-calculate trip costs based on trip data, vehicle, driver, and settings.
 * Deletes existing AUTO costs and replaces them.
 */
export function useAutoCalculateTripCosts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      tenantId: string;
      tripId: string;
      input: CostCalculationInput;
      costTypeMap: Record<string, string>; // category -> cost_type_id
    }) => {
      const { tenantId, tripId, input, costTypeMap } = params;

      // Delete existing AUTO costs for this trip
      const { error: deleteErr } = await supabase
        .from("trip_costs" as any)
        .delete()
        .eq("trip_id", tripId)
        .eq("source", "AUTO");

      if (deleteErr) throw deleteErr;

      // Calculate costs
      const breakdown = calculateTripCosts(input);

      // Insert new costs
      const inserts = breakdown.items
        .filter((item) => item.amount > 0)
        .map((item) => {
          const costTypeId = costTypeMap[item.cost_type_name] ?? costTypeMap[item.category];
          if (!costTypeId) return null;
          return {
            tenant_id: tenantId,
            trip_id: tripId,
            cost_type_id: costTypeId,
            amount: item.amount,
            source: "AUTO",
            notes: `Auto-berekend: ${item.cost_type_name}`,
          };
        })
        .filter(Boolean);

      if (inserts.length > 0) {
        const { error: insertErr } = await supabase
          .from("trip_costs" as any)
          .insert(inserts);

        if (insertErr) throw insertErr;
      }

      return breakdown;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["trip_costs", variables.tripId] });
      toast.success("Kosten automatisch berekend");
    },
    onError: () => {
      toast.error("Fout bij automatisch berekenen kosten");
    },
  });
}
