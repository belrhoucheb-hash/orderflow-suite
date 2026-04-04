/**
 * F5: Emballage — CRUD hooks for packaging_movements and packaging_balances.
 * Uses fromTable() because packaging_movements is not yet in the generated Supabase types.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromTable } from "@/lib/supabaseHelpers";
import { supabase } from "@/integrations/supabase/client";
import type {
  PackagingMovement,
  PackagingMovementInsert,
  PackagingBalance,
  LoadingUnit,
} from "@/types/f5";

/* ── loading_units (already in generated types) ─────────────────── */

export function useLoadingUnits() {
  return useQuery<LoadingUnit[]>({
    queryKey: ["loading_units"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loading_units")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LoadingUnit[];
    },
  });
}

/* ── packaging_movements ────────────────────────────────────────── */

export function usePackagingMovements(options?: string | { clientId?: string }) {
  // Accept either a plain string clientId or an options object
  const clientId = typeof options === "string" ? options : options?.clientId;
  return useQuery<PackagingMovement[]>({
    queryKey: ["packaging_movements", clientId],
    enabled: clientId !== undefined ? !!clientId : true,
    staleTime: 10_000,
    queryFn: async () => {
      let q = fromTable("packaging_movements")
        .select(
          "*, loading_unit:loading_units(id,name,code), client:clients(id,name)"
        )
        .order("recorded_at", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PackagingMovement[];
    },
  });
}

export function useAllPackagingMovements() {
  return useQuery<PackagingMovement[]>({
    queryKey: ["packaging_movements_all"],
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await fromTable("packaging_movements")
        .select(
          "*, loading_unit:loading_units(id,name,code), client:clients(id,name)"
        )
        .order("recorded_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as PackagingMovement[];
    },
  });
}

export function useCreatePackagingMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PackagingMovementInsert) => {
      const { data, error } = await fromTable("packaging_movements")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as PackagingMovement;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packaging_movements"] });
      qc.invalidateQueries({ queryKey: ["packaging_movements_all"] });
      qc.invalidateQueries({ queryKey: ["packaging_balances"] });
    },
  });
}

export function useDeletePackagingMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await fromTable("packaging_movements")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packaging_movements"] });
      qc.invalidateQueries({ queryKey: ["packaging_movements_all"] });
      qc.invalidateQueries({ queryKey: ["packaging_balances"] });
    },
  });
}

/* ── packaging_balances (VIEW) ──────────────────────────────────── */

export function usePackagingBalances(clientId?: string) {
  return useQuery<PackagingBalance[]>({
    queryKey: ["packaging_balances", clientId],
    staleTime: 10_000,
    queryFn: async () => {
      let q = fromTable("packaging_balances").select("*");
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PackagingBalance[];
    },
  });
}

export function useAllPackagingBalances() {
  return useQuery<PackagingBalance[]>({
    queryKey: ["packaging_balances_all"],
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await fromTable("packaging_balances").select("*");
      if (error) throw error;
      return (data ?? []) as PackagingBalance[];
    },
  });
}

/** Per-client packaging balance query — returns raw React Query result */
export function useClientPackagingBalance(clientId?: string) {
  return useQuery<PackagingBalance[]>({
    queryKey: ["packaging_balances", clientId],
    enabled: !!clientId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await fromTable("packaging_balances")
        .select("*")
        .eq("client_id", clientId!);
      if (error) throw error;
      return (data ?? []) as PackagingBalance[];
    },
  });
}
