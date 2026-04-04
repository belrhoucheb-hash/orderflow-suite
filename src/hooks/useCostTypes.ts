import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromTable } from "@/lib/supabaseHelpers";
import { toast } from "sonner";
import type { CostType } from "@/types/costModels";

export interface UseCostTypesOptions {
  activeOnly?: boolean;
}

export function useCostTypes(options: UseCostTypesOptions = {}) {
  const { activeOnly = true } = options;
  return useQuery({
    queryKey: ["cost_types", { activeOnly }],
    staleTime: 15_000,
    queryFn: async () => {
      let query = fromTable("cost_types")
        .select("*")
        .order("name", { ascending: true });
      if (activeOnly) query = query.eq("is_active", true);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as CostType[];
    },
  });
}

export interface CreateCostTypeInput {
  tenant_id: string;
  name: string;
  category: string;
  calculation_method: string;
  default_rate?: number | null;
  is_active?: boolean;
}

export function useCreateCostType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCostTypeInput) => {
      const { data, error } = await fromTable("cost_types")
        .insert({
          tenant_id: input.tenant_id,
          name: input.name,
          category: input.category,
          calculation_method: input.calculation_method,
          default_rate: input.default_rate ?? null,
          is_active: input.is_active ?? true,
        }).select().single();
      if (error) throw error;
      return data as CostType;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cost_types"] }); toast.success("Kostentype aangemaakt"); },
    onError: () => { toast.error("Fout bij aanmaken kostentype"); },
  });
}

export function useUpdateCostType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CreateCostTypeInput> }) => {
      const { data, error } = await fromTable("cost_types")
        .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return data as CostType;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cost_types"] }); toast.success("Kostentype bijgewerkt"); },
    onError: () => { toast.error("Fout bij bijwerken kostentype"); },
  });
}

export function useDeleteCostType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromTable("cost_types").delete().eq("id", id);
      if (error) throw error;
      return true;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cost_types"] }); toast.success("Kostentype verwijderd"); },
    onError: () => { toast.error("Fout bij verwijderen kostentype"); },
  });
}
