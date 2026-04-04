import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Surcharge, SurchargeAppliesTo, SurchargeType } from "@/types/rateModels";

export function useSurcharges(activeOnly = true) {
  return useQuery({
    queryKey: ["surcharges", { activeOnly }],
    staleTime: 15_000,
    queryFn: async () => {
      let query = (supabase as any).from("surcharges").select("*").order("name", { ascending: true });
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Surcharge[];
    },
  });
}

export interface CreateSurchargeInput {
  tenant_id: string; name: string; surcharge_type: SurchargeType; amount: number; applies_to?: SurchargeAppliesTo;
}

export function useCreateSurcharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateSurchargeInput) => {
      const { data, error } = await (supabase as any).from("surcharges")
        .insert({ tenant_id: input.tenant_id, name: input.name, surcharge_type: input.surcharge_type,
          amount: input.amount, applies_to: input.applies_to ?? {}, is_active: true }).select().single();
      if (error) throw error;
      return data as Surcharge;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["surcharges"] }); toast.success("Toeslag aangemaakt"); },
    onError: () => { toast.error("Fout bij aanmaken toeslag"); },
  });
}

export function useUpdateSurcharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateSurchargeInput> & { is_active?: boolean } }) => {
      const { data, error } = await (supabase as any).from("surcharges")
        .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data as Surcharge;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["surcharges"] }); toast.success("Toeslag bijgewerkt"); },
    onError: () => { toast.error("Fout bij bijwerken toeslag"); },
  });
}

export function useDeleteSurcharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("surcharges").delete().eq("id", id);
      if (error) throw error; return true;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["surcharges"] }); toast.success("Toeslag verwijderd"); },
    onError: () => { toast.error("Fout bij verwijderen toeslag"); },
  });
}
