import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantInsert } from "@/hooks/useTenantInsert";
import type { ShiftTemplate } from "@/types/rooster";
import type { ShiftTemplateInput } from "@/lib/validation/shiftTemplateSchema";

export function useShiftTemplates(options?: { includeInactive?: boolean }) {
  const queryClient = useQueryClient();
  const inserter = useTenantInsert("shift_templates");
  const includeInactive = options?.includeInactive ?? false;

  const query = useQuery({
    queryKey: ["shift-templates", { includeInactive }],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase
        .from("shift_templates")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return data as ShiftTemplate[];
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (input: ShiftTemplateInput) => {
      const { data, error } = await inserter
        .insert(input)
        .select()
        .single();
      if (error) throw error;
      return data as ShiftTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-templates"] });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ShiftTemplateInput> }) => {
      const { data, error } = await supabase
        .from("shift_templates")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ShiftTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-templates"] });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("shift_templates")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-templates"] });
    },
  });

  return {
    ...query,
    templates: query.data ?? [],
    createTemplate,
    updateTemplate,
    deleteTemplate,
  };
}
