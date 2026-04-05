import { haversineKm, type GeoCoord } from "@/data/geoData";
import type { ConsolidationGroup } from "@/types/consolidation";
import type { ConsolidatableOrder } from "@/lib/consolidationEngine";

export type SuggestionType = "PAST_IN_GROEP" | "LAGE_BENUTTING" | "INCOMPATIBEL" | "DEADLINE";

export interface Suggestion {
  type: SuggestionType;
  groupId: string;
  orderId: string | null;
  message: string;
  priority: number; // 1=high, 5=low
}

export interface SuggestionInput {
  groups: ConsolidationGroup[];
  unassignedOrders: ConsolidatableOrder[];
  coordMap: Map<string, GeoCoord>;
  vehicleCapacityKg: number;
  vehicleCapacityPallets: number;
}

function parseMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function generateSuggestions(input: SuggestionInput): Suggestion[] {
  const { groups, unassignedOrders, coordMap, vehicleCapacityKg, vehicleCapacityPallets } = input;
  const suggestions: Suggestion[] = [];

  // 1. Low utilization warnings
  for (const group of groups) {
    if ((group.utilization_pct || 0) < 40) {
      suggestions.push({
        type: "LAGE_BENUTTING",
        groupId: group.id,
        orderId: null,
        message: `${group.name}: slechts ${group.utilization_pct}% benut. Voeg meer orders toe.`,
        priority: 3,
      });
    }
  }

  // 2. Check unassigned orders that could fit in existing groups
  for (const order of unassignedOrders) {
    const orderCoord = coordMap.get(order.id);

    // Deadline warning for tight time windows
    if (order.time_window_end) {
      const endMin = parseMinutes(order.time_window_end);
      if (endMin <= 480) { // before 08:00
        suggestions.push({
          type: "DEADLINE",
          groupId: groups[0]?.id || "",
          orderId: order.id,
          message: `Order #${order.order_number}: strakke deadline (${order.time_window_end}). Prioriteer toewijzing.`,
          priority: 1,
        });
      }
    }

    for (const group of groups) {
      // Check weight fit
      const newWeight = (group.total_weight_kg || 0) + order.weight_kg;
      const newPallets = (group.total_pallets || 0) + order.quantity;

      if (newWeight > vehicleCapacityKg || newPallets > vehicleCapacityPallets) {
        continue; // doesn't fit
      }

      // Check proximity: is order near this group's region?
      let isNearby = false;
      if (orderCoord && group.orders) {
        for (const co of group.orders) {
          const coCoord = coordMap.get(co.order_id);
          if (coCoord) {
            const dist = haversineKm(orderCoord, coCoord);
            if (dist < 30) {
              isNearby = true;
              break;
            }
          }
        }
      }

      // Check region match by postcode
      const orderPrefix = order.delivery_postcode?.substring(0, 2) || "";
      const groupPrefix = group.name.match(/\d{2}/)?.[0] || "";
      const regionMatch = orderPrefix === groupPrefix || isNearby;

      if (regionMatch || isNearby) {
        // Check requirements compatibility
        const hasSpecialReqs = order.requirements.some((r) =>
          ["ADR", "KOELING"].includes(r.toUpperCase())
        );

        if (hasSpecialReqs) {
          suggestions.push({
            type: "INCOMPATIBEL",
            groupId: group.id,
            orderId: order.id,
            message: `Order #${order.order_number} (${order.requirements.join(", ")}): controleer voertuig-eisen voor ${group.name}.`,
            priority: 2,
          });
        }

        suggestions.push({
          type: "PAST_IN_GROEP",
          groupId: group.id,
          orderId: order.id,
          message: `Order #${order.order_number} (${order.client_name}) past in ${group.name}: +${order.weight_kg}kg, +${order.quantity} pallets.`,
          priority: 2,
        });
      }
    }
  }

  return suggestions.sort((a, b) => a.priority - b.priority);
}
