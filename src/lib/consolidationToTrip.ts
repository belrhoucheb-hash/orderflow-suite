/**
 * Consolidation → Trip conversion
 * Pure function that maps an approved ConsolidationGroup to TripInput + StopInputs.
 */
import type { ConsolidationGroup } from "@/types/consolidation";

// ─── Output types ─────────────────────────────────────────────

export interface TripInput {
  tenant_id: string;
  vehicle_id: string;
  driver_id: null;
  planned_date: string;
  planned_start_time: null;
  dispatch_status: "CONCEPT";
  notes: string | null;
}

export interface StopInput {
  order_id: string;
  stop_type: "DELIVERY";
  stop_sequence: number;
  stop_status: "GEPLAND";
  planned_address: string;
  /** Time window start — used as planned_time; null if no window */
  planned_time: string | null;
  planned_latitude: null;
  planned_longitude: null;
}

// ─── buildTripFromGroup ───────────────────────────────────────

/**
 * Converts an approved ConsolidationGroup into a TripInput and an array of
 * StopInputs ready for insertion into `trips` and `trip_stops`.
 *
 * @throws Error if the group has no vehicle_id assigned.
 */
export function buildTripFromGroup(
  group: ConsolidationGroup,
): { trip: TripInput; stops: StopInput[] } {
  if (!group.vehicle_id) {
    throw new Error("Kan rit niet aanmaken: geen voertuig toegewezen aan de groep");
  }

  const trip: TripInput = {
    tenant_id: group.tenant_id,
    vehicle_id: group.vehicle_id,
    driver_id: null,
    planned_date: group.planned_date,
    planned_start_time: null,
    dispatch_status: "CONCEPT",
    notes: `Aangemaakt vanuit consolidatiegroep: ${group.name}`,
  };

  // Sort orders by stop_sequence (ascending, nulls last)
  const sortedOrders = [...(group.orders ?? [])].sort((a, b) => {
    const seqA = a.stop_sequence ?? 9999;
    const seqB = b.stop_sequence ?? 9999;
    return seqA - seqB;
  });

  const stops: StopInput[] = sortedOrders.map((co, idx) => ({
    order_id: co.order_id,
    stop_type: "DELIVERY",
    stop_sequence: co.stop_sequence ?? idx + 1,
    stop_status: "GEPLAND",
    planned_address: co.order?.delivery_address ?? "",
    planned_time: co.order?.time_window_start ?? null,
    planned_latitude: null,
    planned_longitude: null,
  }));

  return { trip, stops };
}
