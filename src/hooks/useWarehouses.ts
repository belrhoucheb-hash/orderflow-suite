import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";
import { toast } from "sonner";

export interface Warehouse {
  id: string;
  tenant_id: string;
  name: string;
  address: string;
  warehouse_type: "OPS" | "EXPORT" | "IMPORT";
  transport_flow: "import" | "export" | "both";
  default_stop_role: "pickup" | "delivery";
  warehouse_reference_mode: "manual" | "order_number";
  warehouse_reference_prefix: string | null;
  manual_reference: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type WarehouseInput = Pick<
  Warehouse,
  | "name"
  | "address"
  | "warehouse_type"
  | "transport_flow"
  | "default_stop_role"
  | "warehouse_reference_mode"
  | "warehouse_reference_prefix"
  | "manual_reference"
  | "is_default"
>;

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
        .is("deleted_at", null)
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Opgeslagen", { description: "Warehouse toegevoegd." });
    },
    onError: (err: Error) => {
      toast.error("Fout", { description: err.message || "Kon warehouse niet opslaan." });
    },
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouses"] });
      toast.success("Opgeslagen", { description: "Warehouse bijgewerkt." });
    },
    onError: (err: Error) => {
      toast.error("Fout", { description: err.message || "Kon warehouse niet opslaan." });
    },
  });
}
