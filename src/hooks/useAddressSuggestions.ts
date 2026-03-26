import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AddressSuggestion {
  address: string;
  frequency: number;
  lastUsed: string;
  field: "pickup" | "delivery";
}

/**
 * Queries historical orders for a given client to suggest addresses.
 * Returns the most frequently used pickup and delivery addresses.
 */
export function useAddressSuggestions(clientName: string | null) {
  return useQuery({
    queryKey: ["address-suggestions", clientName],
    enabled: !!clientName && clientName.length > 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("pickup_address, delivery_address, created_at")
        .ilike("client_name", `%${clientName}%`)
        .neq("status", "DRAFT")
        .neq("status", "CANCELLED")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      if (!data || data.length === 0) return { pickup: [], delivery: [] };

      const pickupCounts = new Map<string, { count: number; lastUsed: string }>();
      const deliveryCounts = new Map<string, { count: number; lastUsed: string }>();

      for (const row of data) {
        if (row.pickup_address && row.pickup_address.trim().length > 3) {
          const key = row.pickup_address.trim();
          const existing = pickupCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            pickupCounts.set(key, { count: 1, lastUsed: row.created_at });
          }
        }
        if (row.delivery_address && row.delivery_address.trim().length > 3) {
          const key = row.delivery_address.trim();
          const existing = deliveryCounts.get(key);
          if (existing) {
            existing.count++;
          } else {
            deliveryCounts.set(key, { count: 1, lastUsed: row.created_at });
          }
        }
      }

      const toSuggestions = (map: Map<string, { count: number; lastUsed: string }>, field: "pickup" | "delivery"): AddressSuggestion[] =>
        Array.from(map.entries())
          .map(([address, { count, lastUsed }]) => ({ address, frequency: count, lastUsed, field }))
          .sort((a, b) => b.frequency - a.frequency)
          .slice(0, 5);

      return {
        pickup: toSuggestions(pickupCounts, "pickup"),
        delivery: toSuggestions(deliveryCounts, "delivery"),
        orderCount: data.length,
      };
    },
    staleTime: 60_000,
  });
}

/**
 * Stores a correction so future lookups learn from it.
 * Simply saves the corrected address on the order — future queries pick it up.
 */
export async function recordAddressCorrection(
  orderId: string,
  field: "pickup_address" | "delivery_address",
  correctedValue: string
) {
  const { error } = await supabase
    .from("orders")
    .update({ [field]: correctedValue })
    .eq("id", orderId);
  if (error) throw error;
}
