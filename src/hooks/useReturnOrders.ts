/**
 * F5: Retourzendingen — hooks for creating and querying return orders.
 * A return order is an order with order_type = 'RETOUR' and parent_order_id set.
 * The pickup/delivery addresses are swapped from the parent.
 * Uses fromTable() for order_type/return_reason fields (not yet in generated types).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fromTable } from "@/lib/supabaseHelpers";
import type { RetourOrderCreate, OrderType, ReturnReason } from "@/types/f5";

export interface ReturnOrderRow {
  id: string;
  order_number: number;
  order_type: OrderType;
  return_reason: ReturnReason | null;
  parent_order_id: string | null;
  client_name: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  status: string;
  created_at: string;
  tenant_id: string;
  weight_kg: number | null;
  quantity: number | null;
  unit: string | null;
  priority: string;
}

/** All orders — with order_type filter support */
export function useOrdersByType(orderType?: OrderType) {
  return useQuery<ReturnOrderRow[]>({
    queryKey: ["orders_by_type", orderType],
    staleTime: 10_000,
    queryFn: async () => {
      let q = fromTable("orders")
        .select(
          "id, order_number, order_type, return_reason, parent_order_id, client_name, pickup_address, delivery_address, status, created_at, tenant_id, weight_kg, quantity, unit, priority"
        )
        .order("created_at", { ascending: false });
      if (orderType) q = q.eq("order_type", orderType);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ReturnOrderRow[];
    },
  });
}

/** Return orders for a specific parent order */
export function useReturnOrders(parentOrderId: string) {
  return {
    queryKey: ["orders", "returns", parentOrderId],
    enabled: !!parentOrderId,
    queryFn: async () => {
      const { data, error } = await fromTable("orders")
        .select(
          "id, order_number, order_type, return_reason, parent_order_id, client_name, pickup_address, delivery_address, status, created_at, tenant_id, weight_kg, quantity, unit, priority"
        )
        .eq("parent_order_id", parentOrderId)
        .eq("order_type", "RETOUR")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ReturnOrderRow[];
    },
  };
}

interface CreateReturnOrderInput {
  parentOrderId: string;
  returnReason: ReturnReason;
  notes?: string;
  quantity?: number;
  weight_kg?: number;
}

/** Create a return order from a parent order, fetching parent and swapping addresses */
export function useCreateReturnOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReturnOrderInput) => {
      // Step 1: fetch the parent order
      const { data: parent, error: fetchError } = await fromTable("orders")
        .select(
          "id, tenant_id, client_name, pickup_address, delivery_address, weight_kg, quantity, unit, priority"
        )
        .eq("id", input.parentOrderId)
        .single();
      if (fetchError) throw fetchError;

      // Step 2: insert the return order (swap pickup/delivery)
      const { data, error } = await fromTable("orders")
        .insert({
          order_type: "RETOUR",
          return_reason: input.returnReason,
          parent_order_id: parent.id,
          client_name: parent.client_name,
          tenant_id: parent.tenant_id,
          // Swap: original delivery → new pickup, original pickup → new delivery
          pickup_address: parent.delivery_address,
          delivery_address: parent.pickup_address,
          weight_kg: input.weight_kg ?? parent.weight_kg,
          quantity: input.quantity ?? parent.quantity,
          unit: parent.unit,
          priority: parent.priority ?? "normaal",
          status: "PENDING",
          thread_type: "MANUAL",
          internal_note: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as ReturnOrderRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["orders_by_type"] });
    },
  });
}

/**
 * Pure helper: build a retour order create payload from a parent order row.
 * Addresses are swapped (delivery → pickup, pickup → delivery).
 */
export function buildRetourPayload(
  parent: {
    id: string;
    client_name: string | null;
    tenant_id: string;
    pickup_address: string | null;
    delivery_address: string | null;
    weight_kg: number | null;
    quantity: number | null;
    unit: string | null;
  },
  reason: ReturnReason
): RetourOrderCreate {
  return {
    parent_order_id: parent.id,
    order_type: "RETOUR",
    return_reason: reason,
    client_name: parent.client_name,
    tenant_id: parent.tenant_id,
    // Swap addresses
    pickup_address: parent.delivery_address,
    delivery_address: parent.pickup_address,
    weight_kg: parent.weight_kg,
    quantity: parent.quantity,
    unit: parent.unit,
    priority: "normaal",
  };
}
