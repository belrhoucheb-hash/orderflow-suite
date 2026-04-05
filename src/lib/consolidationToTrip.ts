import type { ConsolidationGroup } from "@/types/consolidation";

export interface TripInput {
  tenant_id: string;
  vehicle_id: string;
  planned_date: string;
  dispatch_status: string;
  total_distance_km: number | null;
  total_duration_min: number | null;
  notes: string;
}

export interface StopInput {
  order_id: string;
  stop_type: string;
  stop_sequence: number;
  stop_status: string;
  planned_address: string | null;
  planned_window_start: string | null;
  planned_window_end: string | null;
}

export interface TripFromGroup {
  trip: TripInput;
  stops: StopInput[];
}

/**
 * Build a Trip + Stops from an approved consolidation group.
 * Does NOT insert into DB — returns the data for the caller to insert.
 */
export function buildTripFromGroup(group: ConsolidationGroup): TripFromGroup {
  if (!group.vehicle_id) {
    throw new Error("Geen voertuig toegewezen aan deze groep");
  }

  const trip: TripInput = {
    tenant_id: group.tenant_id,
    vehicle_id: group.vehicle_id,
    planned_date: group.planned_date,
    dispatch_status: "CONCEPT",
    total_distance_km: group.total_distance_km,
    total_duration_min: group.estimated_duration_min,
    notes: `Consolidatie: ${group.name}`,
  };

  const stops: StopInput[] = (group.orders || [])
    .sort((a, b) => (a.stop_sequence || 999) - (b.stop_sequence || 999))
    .map((co, idx) => ({
      order_id: co.order_id,
      stop_type: "DELIVERY",
      stop_sequence: idx + 1,
      stop_status: "GEPLAND",
      planned_address: co.order?.delivery_address || null,
      planned_window_start: co.order?.time_window_start || null,
      planned_window_end: co.order?.time_window_end || null,
    }));

  return { trip, stops };
}
