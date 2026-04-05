import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { CostType, CostCategory, CalculationMethod } from "@/types/costModels";

export function useCostTypes(activeOnly = true) {
  return useQuery({
    queryKey: ["cost_types", { activeOnly }],
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from("cost_types" as any)
        .select("*")
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (activeOnly) {
        query = query.eq("is_active", true);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CostType[];
    },
  });
}

export interface CreateCostTypeInput {
  tenant_id: string;
  name: string;
  category: CostCategory;
  calculation_method: CalculationMethod;
  default_rate?: number | null;
}

export function useCreateCostType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCostTypeInput) => {
      const { data, error } = await supabase
        .from("cost_types" as any)
        .insert({
          tenant_id: input.tenant_id,
          name: input.name,
          category: input.category,
          calculation_method: input.calculation_method,
          default_rate: input.default_rate ?? null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CostType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost_types"] });
      toast.success("Kostensoort aangemaakt");
    },
    onError: () => {
      toast.error("Fout bij aanmaken kostensoort");
    },
  });
}

export function useUpdateCostType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateCostTypeInput> & { is_active?: boolean } }) => {
      const { data, error } = await supabase
        .from("cost_types" as any)
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as CostType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost_types"] });
      toast.success("Kostensoort bijgewerkt");
    },
    onError: () => {
      toast.error("Fout bij bijwerken kostensoort");
    },
  });
}

export function useDeleteCostType() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("cost_types" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cost_types"] });
      toast.success("Kostensoort verwijderd");
    },
    onError: () => {
      toast.error("Fout bij verwijderen kostensoort");
    },
  });
}
