import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ReturnReason } from "@/types/packaging";

interface CreateReturnInput {
  parentOrderId: string;
  returnReason: ReturnReason;
  notes?: string;
  quantity?: number;
  weight_kg?: number;
}

export function useCreateReturnOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateReturnInput) => {
      // 1. Fetch the parent order
      const { data: parent, error: fetchErr } = await supabase
        .from("orders")
        .select("*")
        .eq("id", input.parentOrderId)
        .single();

      if (fetchErr) throw fetchErr;
      if (!parent) throw new Error("Originele order niet gevonden");

      // 2. Build the return order with reversed addresses
      const returnOrder = {
        tenant_id: parent.tenant_id,
        parent_order_id: parent.id,
        order_type: "RETOUR" as const,
        return_reason: input.returnReason,
        status: "DRAFT",
        priority: parent.priority,
        client_name: parent.client_name,
        // Reverse pickup and delivery
        pickup_address: parent.delivery_address,
        delivery_address: parent.pickup_address,
        geocoded_pickup_lat: parent.geocoded_delivery_lat,
        geocoded_pickup_lng: parent.geocoded_delivery_lng,
        geocoded_delivery_lat: parent.geocoded_pickup_lat,
        geocoded_delivery_lng: parent.geocoded_pickup_lng,
        // Optionally override quantity/weight, else carry from parent
        quantity: input.quantity ?? parent.quantity,
        unit: parent.unit,
        weight_kg: input.weight_kg ?? parent.weight_kg,
        is_weight_per_unit: parent.is_weight_per_unit,
        requirements: parent.requirements,
        transport_type: parent.transport_type,
        internal_note: input.notes ?? `Retour van order #${parent.order_number}`,
        source_email_from: parent.source_email_from,
        thread_type: "retour",
      };

      const { data, error } = await supabase
        .from("orders")
        .insert([returnOrder])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/**
 * Fetch return orders linked to a specific parent order.
 */
export function useReturnOrders(parentOrderId: string) {
  return {
    queryKey: ["orders", "returns", parentOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("parent_order_id", parentOrderId)
        .eq("order_type", "RETOUR")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!parentOrderId,
  };
}
