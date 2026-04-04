import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ConsolidationGroup, ConsolidationOrder } from "@/types/consolidation";
import { fromTable } from "@/lib/supabaseHelpers";

export function useConsolidationGroups(plannedDate: string | null) {
  return useQuery({
    queryKey: ["consolidation_groups", plannedDate], enabled: !!plannedDate, staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await fromTable("consolidation_groups")
        .select("*, consolidation_orders(*, order:orders(id, order_number, client_name, delivery_address, weight_kg, quantity, requirements, time_window_start, time_window_end))")
        .eq("planned_date", plannedDate!).order("created_at");
      if (error) throw error;
      return data as ConsolidationGroup[];
    },
  });
}

export function useConsolidationGroupOrders(groupId: string | null) {
  return useQuery({
    queryKey: ["consolidation_orders", groupId], enabled: !!groupId, staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await fromTable("consolidation_orders")
        .select("*, order:orders(id, order_number, client_name, delivery_address, weight_kg, quantity, requirements)")
        .eq("group_id", groupId!).order("stop_sequence");
      if (error) throw error;
      return data as ConsolidationOrder[];
    },
  });
}

export function useCreateConsolidationGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (group: Omit<ConsolidationGroup, "id" | "created_at" | "updated_at" | "orders" | "vehicle">) => {
      const { data, error } = await fromTable("consolidation_groups").insert(group).select().single();
      if (error) throw error; return data as ConsolidationGroup;
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["consolidation_groups", v.planned_date] }); },
  });
}

export function useUpdateConsolidationGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ConsolidationGroup> & { id: string }) => {
      const { data, error } = await fromTable("consolidation_groups").update(updates).eq("id", id).select().single();
      if (error) throw error; return data as ConsolidationGroup;
    },
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["consolidation_groups", data.planned_date] }); },
  });
}

export function useAddOrderToGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ groupId, orderId, stopSequence }: { groupId: string; orderId: string; stopSequence: number | null }) => {
      const { data, error } = await fromTable("consolidation_orders").insert({ group_id: groupId, order_id: orderId, stop_sequence: stopSequence }).select().single();
      if (error) throw error; return data as ConsolidationOrder;
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["consolidation_orders", v.groupId] }); qc.invalidateQueries({ queryKey: ["consolidation_groups"] }); },
  });
}

export function useRemoveOrderFromGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId: string }) => {
      const { error } = await fromTable("consolidation_orders").delete().eq("id", id);
      if (error) throw error; return { id, groupId };
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["consolidation_orders", v.groupId] }); qc.invalidateQueries({ queryKey: ["consolidation_groups"] }); },
  });
}

export function useMoveOrderBetweenGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ consolidationOrderId, fromGroupId, toGroupId, newSequence }: { consolidationOrderId: string; fromGroupId: string; toGroupId: string; newSequence: number; }) => {
      const { data, error } = await fromTable("consolidation_orders").update({ group_id: toGroupId, stop_sequence: newSequence }).eq("id", consolidationOrderId).select().single();
      if (error) throw error; return { data, fromGroupId, toGroupId };
    },
    onSuccess: (_d, v) => { qc.invalidateQueries({ queryKey: ["consolidation_orders", v.fromGroupId] }); qc.invalidateQueries({ queryKey: ["consolidation_orders", v.toGroupId] }); qc.invalidateQueries({ queryKey: ["consolidation_groups"] }); },
  });
}
