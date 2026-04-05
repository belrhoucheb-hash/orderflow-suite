import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Surcharge, SurchargeAppliesTo, SurchargeType } from "@/types/rateModels";

// ─── List Surcharges ────────────────────────────────────────

export function useSurcharges(activeOnly = true) {
  return useQuery({
    queryKey: ["surcharges", { activeOnly }],
    staleTime: 15_000,
    queryFn: async () => {
      let query = supabase
        .from("surcharges" as any)
        .select("*")
        .order("name", { ascending: true });

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Surcharge[];
    },
  });
}

// ─── Create Surcharge ───────────────────────────────────────

export interface CreateSurchargeInput {
  tenant_id: string;
  name: string;
  surcharge_type: SurchargeType;
  amount: number;
  applies_to?: SurchargeAppliesTo;
}

export function useCreateSurcharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSurchargeInput) => {
      const { data, error } = await supabase
        .from("surcharges" as any)
        .insert({
          tenant_id: input.tenant_id,
          name: input.name,
          surcharge_type: input.surcharge_type,
          amount: input.amount,
          applies_to: input.applies_to ?? {},
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Surcharge;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surcharges"] });
      toast.success("Toeslag aangemaakt");
    },
    onError: () => {
      toast.error("Fout bij aanmaken toeslag");
    },
  });
}

// ─── Update Surcharge ───────────────────────────────────────

export function useUpdateSurcharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateSurchargeInput> & { is_active?: boolean } }) => {
      const { data, error } = await supabase
        .from("surcharges" as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Surcharge;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surcharges"] });
      toast.success("Toeslag bijgewerkt");
    },
    onError: () => {
      toast.error("Fout bij bijwerken toeslag");
    },
  });
}

// ─── Delete Surcharge ───────────────────────────────────────

export function useDeleteSurcharge() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("surcharges" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surcharges"] });
      toast.success("Toeslag verwijderd");
    },
    onError: () => {
      toast.error("Fout bij verwijderen toeslag");
    },
  });
}
