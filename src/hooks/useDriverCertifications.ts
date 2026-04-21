import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantInsert } from "@/hooks/useTenantInsert";

export interface DriverCertification {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DriverCertificationInput {
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
}

const QUERY_KEY = ["driver-certifications"] as const;

export function useDriverCertifications() {
  return useQuery<DriverCertification[]>({
    queryKey: QUERY_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_certifications" as any)
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DriverCertification[];
    },
  });
}

export function useCreateDriverCertification() {
  const qc = useQueryClient();
  const insert = useTenantInsert("driver_certifications");
  return useMutation({
    mutationFn: async (values: DriverCertificationInput) => {
      const payload = {
        code: values.code.trim().toLowerCase(),
        name: values.name.trim(),
        description: values.description?.trim() || null,
        sort_order: values.sort_order ?? 0,
        is_active: values.is_active ?? true,
      };
      const { data, error } = await insert.insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useUpdateDriverCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DriverCertificationInput> & { id: string }) => {
      const patch: Record<string, unknown> = {};
      if (updates.name !== undefined) patch.name = updates.name.trim();
      if (updates.description !== undefined) patch.description = updates.description?.toString().trim() || null;
      if (updates.sort_order !== undefined && updates.sort_order !== null) patch.sort_order = updates.sort_order;
      if (updates.is_active !== undefined) patch.is_active = updates.is_active;

      const { data, error } = await supabase
        .from("driver_certifications" as any)
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

export function useDeleteDriverCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("driver_certifications" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
