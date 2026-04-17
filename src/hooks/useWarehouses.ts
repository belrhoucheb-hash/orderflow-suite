import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

export interface Warehouse {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  warehouse_type: "OPS" | "EXPORT" | "IMPORT";
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type WarehouseInput = Pick<Warehouse, "name" | "address" | "warehouse_type" | "is_default">;

export function useWarehouses() {
  const { tenant } = useTenantOptional();
  return useQuery({
    queryKey: ["warehouses", tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("tenant_warehouses")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("warehouse_type", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });
}

export function useCreateWarehouse() {
  const { tenant } = useTenantOptional();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WarehouseInput) => {
      if (!tenant?.id) throw new Error("Geen tenant");
      const { data, error } = await (supabase as any)
        .from("tenant_warehouses")
        .insert({ ...input, tenant_id: tenant.id })
        .select("*")
        .single();
      if (error) throw error;
      return data as Warehouse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warehouses"] }),
  });
}

export function useUpdateWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: WarehouseInput & { id: string }) => {
      const { data, error } = await (supabase as any)
        .from("tenant_warehouses")
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return data as Warehouse;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warehouses"] }),
  });
}

export function useDeleteWarehouse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("tenant_warehouses")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["warehouses"] }),
  });
}