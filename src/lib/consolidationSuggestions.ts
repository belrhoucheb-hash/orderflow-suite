/**
 * Smart Consolidation Suggestions Engine
 * Analyses consolidation groups and unassigned orders to produce actionable suggestions.
 */
import { haversineKm } from "@/data/geoData";
import type { ConsolidatableOrder } from "@/lib/consolidationEngine";
import type { ConsolidationGroup } from "@/types/consolidation";

// ─── Types ────────────────────────────────────────────────────

export type SuggestionType = "PAST_IN_GROEP" | "LAGE_BENUTTING" | "INCOMPATIBEL" | "DEADLINE";

export interface Suggestion {
  type: SuggestionType;
  groupId: string;
  /** The relevant order id (for PAST_IN_GROEP, INCOMPATIBEL, DEADLINE) */
  orderId?: string;
  /** Human-readable Dutch message */
  message: string;
}

export interface SuggestionInput {
  groups: ConsolidationGroup[];
  unassignedOrders: ConsolidatableOrder[];
}

// ─── Thresholds ───────────────────────────────────────────────

const LOW_UTILIZATION_THRESHOLD = 0.40;   // < 40%
const NEARBY_KM_THRESHOLD = 30;           // < 30 km
const TIGHT_DEADLINE_HOUR = 8;            // window_end before 08:00

// ─── generateSuggestions ─────────────────────────────────────

/**
 * Generates a list of suggestions for the given groups + unassigned orders.
 */
export function generateSuggestions(input: SuggestionInput): Suggestion[] {
  const { groups, unassignedOrders } = input;
  const suggestions: Suggestion[] = [];

  for (const group of groups) {
    // Skip rejected groups
    if (group.status === "VERWORPEN") continue;

    const orders = group.orders ?? [];

    // ── 1. Low utilization warning ────────────────────────────
    if (
      group.utilization_pct != null &&
      group.utilization_pct < LOW_UTILIZATION_THRESHOLD
    ) {
      suggestions.push({
        type: "LAGE_BENUTTING",
        groupId: group.id,
        message: `Groep "${group.name}" heeft een lage benutting van ${Math.round(group.utilization_pct * 100)}% (< ${LOW_UTILIZATION_THRESHOLD * 100}%). Overweeg meer orders toe te voegen.`,
      });
    }

    // ── 2. Incompatible requirements ──────────────────────────
    const requirementSets = orders
      .map((co) => co.order?.requirements ?? [])
      .filter((reqs) => reqs.length > 0);

    if (requirementSets.length >= 2) {
      const allReqs = requirementSets.flat();
      const uniqueReqs = [...new Set(allReqs)];
      // Check if there are conflicting requirements that are mutually exclusive
      // (e.g. ADR + KOELING in the same trip is a common incompatibility)
      const hasConflict = _hasIncompatibleRequirements(uniqueReqs);
      if (hasConflict) {
        suggestions.push({
          type: "INCOMPATIBEL",
          groupId: group.id,
          message: `Groep "${group.name}" bevat orders met conflicterende vereisten: ${uniqueReqs.join(", ")}. Controleer of het voertuig dit ondersteunt.`,
        });
      }
    }

    // ── 3. Tight deadline ─────────────────────────────────────
    for (const co of orders) {
      const windowEnd = co.order?.time_window_end;
      if (windowEnd) {
        const endHour = _toHour(windowEnd);
        if (endHour < TIGHT_DEADLINE_HOUR) {
          suggestions.push({
            type: "DEADLINE",
            groupId: group.id,
            orderId: co.order_id,
            message: `Order #${co.order?.order_number ?? co.order_id} in groep "${group.name}" heeft een strak tijdvenster dat eindigt om ${windowEnd}. Vroeg vertrek vereist.`,
          });
        }
      }
    }

    // ── 4. Nearby unassigned order fits in low-utilization group ─
    if (
      group.utilization_pct != null &&
      group.utilization_pct < LOW_UTILIZATION_THRESHOLD &&
      group.vehicle?.capacityKg != null
    ) {
      // Compute centroid from group order coordinates (from coordMap / geocoded fields on unassigned orders)
      // ConsolidationOrder embeds a partial order without geocoded fields, so collect what we can.
      const groupCoords = orders
        .map((co) => {
          const o = co.order as (typeof co.order & { geocoded_delivery_lat?: number | null; geocoded_delivery_lng?: number | null }) | undefined;
          if (o?.geocoded_delivery_lat != null && o?.geocoded_delivery_lng != null) {
            return { lat: o.geocoded_delivery_lat, lng: o.geocoded_delivery_lng };
          }
          return null;
        })
        .filter((c): c is { lat: number; lng: number } => c !== null);

      const hasCentroid = groupCoords.length > 0;
      const centroid = hasCentroid
        ? {
            lat: groupCoords.reduce((sum, c) => sum + c.lat, 0) / groupCoords.length,
            lng: groupCoords.reduce((sum, c) => sum + c.lng, 0) / groupCoords.length,
          }
        : null;

      for (const unassigned of unassignedOrders) {
        let distKm: number | null = null;

        // If group has coordinates, perform proximity check; otherwise skip it
        if (centroid !== null) {
          if (
            unassigned.geocoded_delivery_lat == null ||
            unassigned.geocoded_delivery_lng == null
          ) continue;

          distKm = haversineKm(centroid, {
            lat: unassigned.geocoded_delivery_lat,
            lng: unassigned.geocoded_delivery_lng,
          });

          if (distKm >= NEARBY_KM_THRESHOLD) continue;
        }

        // Check weight would still fit
        const currentWeight = group.total_weight_kg ?? 0;
        const addedWeight = unassigned.is_weight_per_unit
          ? unassigned.weight_kg * unassigned.quantity
          : unassigned.weight_kg;

        if (currentWeight + addedWeight <= group.vehicle.capacityKg) {
          const distLabel = distKm !== null ? ` op ${distKm.toFixed(1)} km van` : " nabij";
          suggestions.push({
            type: "PAST_IN_GROEP",
            groupId: group.id,
            orderId: unassigned.id,
            message: `Order #${unassigned.order_number} (${unassigned.client_name}) ligt${distLabel} groep "${group.name}" en past binnen de capaciteit. Overweeg toe te voegen.`,
          });
        }
      }
    }
  }

  return suggestions;
}

// ─── Helpers ─────────────────────────────────────────────────

function _toHour(hhmm: string): number {
  const [h] = hhmm.split(":").map(Number);
  return h;
}

/**
 * Returns true if the combined requirements set contains mutually incompatible items.
 * Known conflicts: ADR + KOELING in same group.
 */
function _hasIncompatibleRequirements(reqs: string[]): boolean {
  const upper = reqs.map((r) => r.toUpperCase());
  // ADR (dangerous goods) and KOELING (refrigerated) are typically incompatible
  if (upper.includes("ADR") && upper.includes("KOELING")) return true;
  return false;
}
