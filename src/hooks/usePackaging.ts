import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PackagingMovement, PackagingBalance, PackagingDirection } from "@/types/packaging";

// ─── Packaging Balances (from view) ────────────────────────

export function usePackagingBalances() {
  return useQuery({
    queryKey: ["packaging-balances"],
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packaging_balances" as any)
        .select("*")
        .order("balance", { ascending: false });

      if (error) throw error;
      return (data ?? []) as PackagingBalance[];
    },
  });
}

export function useClientPackagingBalance(clientId: string) {
  return useQuery({
    queryKey: ["packaging-balances", "client", clientId],
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("packaging_balances" as any)
        .select("*")
        .eq("client_id", clientId);

      if (error) throw error;
      return (data ?? []) as PackagingBalance[];
    },
    enabled: !!clientId,
  });
}

// ─── Packaging Movements (CRUD) ────────────────────────────

export interface PackagingMovementFilters {
  clientId?: string;
  orderId?: string;
  tripStopId?: string;
  loadingUnitId?: string;
  limit?: number;
}

export function usePackagingMovements(filters: PackagingMovementFilters = {}) {
  return useQuery({
    queryKey: ["packaging-movements", filters],
    staleTime: 5_000,
    queryFn: async () => {
      let query = supabase
        .from("packaging_movements" as any)
        .select("*, loading_units(name, code), clients(name)")
        .order("recorded_at", { ascending: false });

      if (filters.clientId) query = query.eq("client_id", filters.clientId);
      if (filters.orderId) query = query.eq("order_id", filters.orderId);
      if (filters.tripStopId) query = query.eq("trip_stop_id", filters.tripStopId);
      if (filters.loadingUnitId) query = query.eq("loading_unit_id", filters.loadingUnitId);
      if (filters.limit) query = query.limit(filters.limit);

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((row: any): PackagingMovement => ({
        id: row.id,
        tenant_id: row.tenant_id,
        client_id: row.client_id,
        order_id: row.order_id,
        trip_stop_id: row.trip_stop_id,
        loading_unit_id: row.loading_unit_id,
        direction: row.direction as PackagingDirection,
        quantity: row.quantity,
        recorded_by: row.recorded_by,
        recorded_at: row.recorded_at,
        notes: row.notes,
        created_at: row.created_at,
        loading_unit: row.loading_units ?? undefined,
        client: row.clients ?? undefined,
      }));
    },
  });
}

export interface CreatePackagingMovementInput {
  tenant_id: string;
  client_id: string;
  order_id?: string;
  trip_stop_id?: string;
  loading_unit_id: string;
  direction: PackagingDirection;
  quantity: number;
  recorded_by?: string;
  notes?: string;
}

export function useCreatePackagingMovement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePackagingMovementInput) => {
      const { data, error } = await supabase
        .from("packaging_movements" as any)
        .insert([input])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packaging-movements"] });
      queryClient.invalidateQueries({ queryKey: ["packaging-balances"] });
    },
  });
}

export function useDeletePackagingMovement() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("packaging_movements" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["packaging-movements"] });
      queryClient.invalidateQueries({ queryKey: ["packaging-balances"] });
    },
  });
}

// ─── Loading Units (for dropdowns) ─────────────────────────

export function useLoadingUnits() {
  return useQuery({
    queryKey: ["loading-units"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loading_units")
        .select("id, name, code, default_weight_kg")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });
}
